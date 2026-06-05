ALTER TABLE public.tournament_results
  ADD COLUMN IF NOT EXISTS recipient_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.get_my_trophies(_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tournament_id uuid, tournament_name text, team_name text, pos integer, prize_note text, trophies_awarded integer, finished_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, r.team_name, res.position, res.prize_note,
    CASE
      WHEN array_length(res.recipient_ids, 1) > 0
        THEN GREATEST(res.trophies_awarded / array_length(res.recipient_ids, 1), 0)
      ELSE res.trophies_awarded
    END AS trophies_awarded,
    t.created_at
  FROM public.tournament_results res
  JOIN public.tournament_registrations r ON r.id = res.registration_id
  JOIN public.tournaments t ON t.id = res.tournament_id
  WHERE COALESCE(_user, auth.uid()) IS NOT NULL
    AND r.banned = false
    AND (
      (array_length(res.recipient_ids, 1) > 0
        AND COALESCE(_user, auth.uid()) = ANY(res.recipient_ids))
      OR
      (COALESCE(array_length(res.recipient_ids, 1), 0) = 0
        AND (r.captain_id = COALESCE(_user, auth.uid())
             OR COALESCE(_user, auth.uid()) = ANY(r.members_ids)))
    )
  ORDER BY res.position ASC, t.created_at DESC;
$function$;