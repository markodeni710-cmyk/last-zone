
-- Restore broad SELECT on base table so PostgREST FK joins still work
DROP POLICY IF EXISTS squads_select_own ON public.squad_listings;
CREATE POLICY squads_select_auth ON public.squad_listings
  FOR SELECT TO authenticated USING (true);

-- Drop the helper view; we'll use column-level privileges instead
DROP VIEW IF EXISTS public.squad_listings_v;

-- Revoke SELECT on the 'contact' column for non-service roles
REVOKE SELECT ON public.squad_listings FROM authenticated, anon;
GRANT SELECT (
  id, user_id, title, description, rank, server_region,
  slots_needed, mode, mic_required, status, created_at, expires_at
) ON public.squad_listings TO authenticated;

-- RPC for owners to retrieve their own contact (used by edit form)
CREATE OR REPLACE FUNCTION public.get_my_squad_contact(_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT contact FROM public.squad_listings
  WHERE id = _id AND user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_squad_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_squad_contact(uuid) TO authenticated;
