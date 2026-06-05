-- Tournament team invites
CREATE TABLE public.tournament_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  captain_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (registration_id, invitee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_team_invites TO authenticated;
GRANT ALL ON public.tournament_team_invites TO service_role;

ALTER TABLE public.tournament_team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY tti_select_involved ON public.tournament_team_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = captain_id OR auth.uid() = invitee_id);

CREATE POLICY tti_insert_captain ON public.tournament_team_invites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = captain_id);

CREATE POLICY tti_update_invitee ON public.tournament_team_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = captain_id);

CREATE POLICY tti_delete_involved ON public.tournament_team_invites
  FOR DELETE TO authenticated
  USING (auth.uid() = captain_id OR auth.uid() = invitee_id);

CREATE INDEX idx_tti_invitee ON public.tournament_team_invites(invitee_id, status);
CREATE INDEX idx_tti_registration ON public.tournament_team_invites(registration_id);

-- Function: accept a tournament invite (adds invitee to members_ids)
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  inv public.tournament_team_invites;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO inv FROM public.tournament_team_invites WHERE id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.invitee_id <> me THEN RAISE EXCEPTION 'not your invite'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'already responded'; END IF;

  UPDATE public.tournament_team_invites
     SET status = 'accepted', responded_at = now()
   WHERE id = _invite_id;

  UPDATE public.tournament_registrations
     SET members_ids = (
       SELECT ARRAY(SELECT DISTINCT unnest(members_ids || ARRAY[me]))
     )
   WHERE id = inv.registration_id;
END $$;

-- Realtime: ensure tables are in publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_team_invites;