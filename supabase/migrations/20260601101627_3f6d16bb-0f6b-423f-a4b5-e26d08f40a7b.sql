
-- Helper: compute available trophy balance for a user
CREATE OR REPLACE FUNCTION public.available_trophies(_user uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(
        CASE
          WHEN COALESCE(array_length(res.recipient_ids, 1), 0) > 0
            AND _user = ANY(res.recipient_ids)
            THEN GREATEST(res.trophies_awarded / array_length(res.recipient_ids, 1), 0)
          ELSE 0
        END
      )::int
      FROM public.tournament_results res
    ), 0)
    -
    COALESCE((
      SELECT SUM(trophies_count)::int
      FROM public.tournaments
      WHERE organizer_id = _user
        AND status <> 'finished'
    ), 0),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.available_trophies(uuid) TO authenticated, anon;

-- Trigger 1: check trophy budget on tournament insert/update
CREATE OR REPLACE FUNCTION public.check_tournament_trophy_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta integer;
  avail integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.trophies_count, 0);
  ELSE
    -- On update, only enforce when raising the count or changing organizer
    IF NEW.organizer_id <> OLD.organizer_id THEN
      RAISE EXCEPTION 'cannot_change_organizer';
    END IF;
    delta := COALESCE(NEW.trophies_count, 0) - COALESCE(OLD.trophies_count, 0);
  END IF;

  IF delta <= 0 THEN
    RETURN NEW;
  END IF;

  avail := public.available_trophies(NEW.organizer_id);
  IF delta > avail THEN
    RAISE EXCEPTION 'insufficient_trophies: need %, available %', delta, avail;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_check_tournament_trophy_budget ON public.tournaments;
CREATE TRIGGER trg_check_tournament_trophy_budget
  BEFORE INSERT OR UPDATE OF trophies_count, organizer_id ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.check_tournament_trophy_budget();

-- Trigger 2: prevent deletion of a finished tournament or one with awarded results
CREATE OR REPLACE FUNCTION public.prevent_finished_tournament_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'finished' THEN
    RAISE EXCEPTION 'cannot_delete_finished_tournament';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot_delete_tournament_with_results';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_finished_tournament_delete ON public.tournaments;
CREATE TRIGGER trg_prevent_finished_tournament_delete
  BEFORE DELETE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finished_tournament_delete();

-- Trigger 3: validate tournament results integrity
CREATE OR REPLACE FUNCTION public.validate_tournament_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tournaments;
  r public.tournament_registrations;
  total integer;
  uid uuid;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id = NEW.tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;

  SELECT * INTO r FROM public.tournament_registrations WHERE id = NEW.registration_id;
  IF NOT FOUND OR r.tournament_id <> NEW.tournament_id THEN
    RAISE EXCEPTION 'invalid_registration';
  END IF;
  IF r.status <> 'accepted' OR r.banned THEN
    RAISE EXCEPTION 'registration_not_eligible';
  END IF;

  -- Must have at least one recipient
  IF NEW.recipient_ids IS NULL OR COALESCE(array_length(NEW.recipient_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  -- Each recipient must be a member of the team and must not be the organizer
  FOREACH uid IN ARRAY NEW.recipient_ids LOOP
    IF uid <> r.captain_id AND NOT (uid = ANY(COALESCE(r.members_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'recipient_not_team_member';
    END IF;
    IF uid = t.organizer_id THEN
      RAISE EXCEPTION 'organizer_cannot_receive_trophies';
    END IF;
  END LOOP;

  IF COALESCE(NEW.trophies_awarded, 0) < 0 THEN
    RAISE EXCEPTION 'negative_trophies';
  END IF;

  -- Sum of trophies awarded must not exceed pool
  SELECT COALESCE(SUM(trophies_awarded), 0) INTO total
  FROM public.tournament_results
  WHERE tournament_id = NEW.tournament_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF total + COALESCE(NEW.trophies_awarded, 0) > COALESCE(t.trophies_count, 0) THEN
    RAISE EXCEPTION 'trophies_exceed_pool: pool=%, would_be=%',
      t.trophies_count, total + NEW.trophies_awarded;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_tournament_result ON public.tournament_results;
CREATE TRIGGER trg_validate_tournament_result
  BEFORE INSERT OR UPDATE ON public.tournament_results
  FOR EACH ROW EXECUTE FUNCTION public.validate_tournament_result();
