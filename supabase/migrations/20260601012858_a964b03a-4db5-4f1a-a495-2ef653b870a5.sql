CREATE OR REPLACE FUNCTION public.get_my_trophies(_user uuid DEFAULT NULL)
RETURNS TABLE(tournament_id uuid, tournament_name text, team_name text, pos integer, prize_note text, finished_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, r.team_name, res.position, res.prize_note, t.created_at
  FROM public.tournament_results res
  JOIN public.tournament_registrations r ON r.id = res.registration_id
  JOIN public.tournaments t ON t.id = res.tournament_id
  WHERE COALESCE(_user, auth.uid()) IS NOT NULL
    AND (r.captain_id = COALESCE(_user, auth.uid())
         OR COALESCE(_user, auth.uid()) = ANY(r.members_ids))
    AND r.banned = false
  ORDER BY res.position ASC, t.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_trophies(uuid) TO authenticated, anon;