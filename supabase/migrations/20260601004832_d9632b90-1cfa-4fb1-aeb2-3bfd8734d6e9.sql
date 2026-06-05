
-- 1) tournaments: new columns
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS map_mode text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS system text,
  ADD COLUMN IF NOT EXISTS min_rank text,
  ADD COLUMN IF NOT EXISTS room_id text,
  ADD COLUMN IF NOT EXISTS room_password text,
  ADD COLUMN IF NOT EXISTS rules text,
  ADD COLUMN IF NOT EXISTS trophies_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 4;

-- 2) tournament_registrations: members ids + banned
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS members_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

-- 3) tournament_results
CREATE TABLE IF NOT EXISTS public.tournament_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  prize_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, position),
  UNIQUE (tournament_id, registration_id)
);

GRANT SELECT ON public.tournament_results TO anon, authenticated;
GRANT ALL ON public.tournament_results TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.tournament_results TO authenticated;

ALTER TABLE public.tournament_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "results_select_all" ON public.tournament_results
  FOR SELECT USING (true);

CREATE POLICY "results_write_organizer" ON public.tournament_results
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.organizer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.organizer_id = auth.uid()));

-- 4) Rank ordering helper
CREATE OR REPLACE FUNCTION public.rank_order(_rank text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_rank,''))
    WHEN 'bronze' THEN 1
    WHEN 'silver' THEN 2
    WHEN 'gold' THEN 3
    WHEN 'platinum' THEN 4
    WHEN 'diamond' THEN 5
    WHEN 'crown' THEN 6
    WHEN 'ace' THEN 7
    WHEN 'conqueror' THEN 8
    ELSE 0
  END;
$$;

-- 5) Room credentials reveal function
CREATE OR REPLACE FUNCTION public.get_tournament_room_credentials(_id uuid)
RETURNS TABLE(room_id text, room_password text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  t public.tournaments;
  is_accepted boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;

  IF t.organizer_id = me THEN
    RETURN QUERY SELECT t.room_id, t.room_password;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_registrations r
    WHERE r.tournament_id = _id
      AND r.status = 'accepted'
      AND r.banned = false
      AND (r.captain_id = me OR me = ANY(r.members_ids))
  ) INTO is_accepted;

  IF NOT is_accepted THEN RAISE EXCEPTION 'not a participant'; END IF;
  IF t.starts_at IS NULL OR now() < (t.starts_at - interval '10 minutes') THEN
    RAISE EXCEPTION 'too early';
  END IF;

  RETURN QUERY SELECT t.room_id, t.room_password;
END $$;

-- 6) Rank check trigger
CREATE OR REPLACE FUNCTION public.check_tournament_rank()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  min_r text;
  cap_rank text;
BEGIN
  SELECT min_rank INTO min_r FROM public.tournaments WHERE id = NEW.tournament_id;
  IF min_r IS NULL OR min_r = '' THEN RETURN NEW; END IF;
  SELECT rank INTO cap_rank FROM public.profiles WHERE id = NEW.captain_id;
  IF public.rank_order(cap_rank) < public.rank_order(min_r) THEN
    RAISE EXCEPTION 'rank_too_low: % required, you are %', min_r, coalesce(cap_rank, 'unranked');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_tournament_rank_trg ON public.tournament_registrations;
CREATE TRIGGER check_tournament_rank_trg
  BEFORE INSERT ON public.tournament_registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_tournament_rank();
