
CREATE OR REPLACE FUNCTION public.is_lovable_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND username = 'moniromran');
$$;

CREATE TABLE IF NOT EXISTS public.admin_trophy_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_trophy_grants_user_idx ON public.admin_trophy_grants(user_id);

GRANT SELECT, INSERT ON public.admin_trophy_grants TO authenticated;
GRANT ALL ON public.admin_trophy_grants TO service_role;

ALTER TABLE public.admin_trophy_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin can insert grants" ON public.admin_trophy_grants;
CREATE POLICY "admin can insert grants" ON public.admin_trophy_grants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_lovable_admin() AND granted_by = auth.uid());

DROP POLICY IF EXISTS "admin sees all grants" ON public.admin_trophy_grants;
CREATE POLICY "admin sees all grants" ON public.admin_trophy_grants
  FOR SELECT TO authenticated
  USING (public.is_lovable_admin() OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.available_trophies(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(CASE
        WHEN COALESCE(array_length(res.recipient_ids, 1), 0) > 0 AND _user = ANY(res.recipient_ids)
          THEN GREATEST(res.trophies_awarded / array_length(res.recipient_ids, 1), 0)
        ELSE 0 END)::int
      FROM public.tournament_results res
    ), 0)
    + COALESCE((SELECT SUM(amount)::int FROM public.admin_trophy_grants WHERE user_id = _user), 0)
    - COALESCE((SELECT SUM(trophies_count)::int FROM public.tournaments
                WHERE organizer_id = _user AND status <> 'finished'), 0),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_trophies(_user uuid DEFAULT NULL::uuid)
RETURNS TABLE(tournament_id uuid, tournament_name text, team_name text, pos integer, prize_note text, trophies_awarded integer, finished_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT t.id AS tournament_id, t.name AS tournament_name, r.team_name, res.position AS pos, res.prize_note,
      (CASE
        WHEN array_length(res.recipient_ids, 1) > 0
          THEN GREATEST(res.trophies_awarded / array_length(res.recipient_ids, 1), 0)
        ELSE res.trophies_awarded
      END)::int AS trophies_awarded,
      t.created_at AS finished_at
    FROM public.tournament_results res
    JOIN public.tournament_registrations r ON r.id = res.registration_id
    JOIN public.tournaments t ON t.id = res.tournament_id
    WHERE COALESCE(_user, auth.uid()) IS NOT NULL AND r.banned = false
      AND (
        (array_length(res.recipient_ids, 1) > 0 AND COALESCE(_user, auth.uid()) = ANY(res.recipient_ids))
        OR (COALESCE(array_length(res.recipient_ids, 1), 0) = 0
            AND (r.captain_id = COALESCE(_user, auth.uid()) OR COALESCE(_user, auth.uid()) = ANY(r.members_ids)))
      )
    UNION ALL
    SELECT NULL::uuid, 'منحة إدارية'::text, NULL::text, NULL::integer,
           COALESCE(g.note, '')::text, g.amount, g.created_at
    FROM public.admin_trophy_grants g
    WHERE g.user_id = COALESCE(_user, auth.uid())
  ) sub
  ORDER BY finished_at DESC NULLS LAST;
$$;
