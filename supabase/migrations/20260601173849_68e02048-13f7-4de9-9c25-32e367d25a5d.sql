
-- Fix mutable search_path on rank_order
CREATE OR REPLACE FUNCTION public.rank_order(_rank text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
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
$function$;

-- Revoke anonymous EXECUTE on SECURITY DEFINER functions that require authentication.
-- These all check auth.uid() internally; revoking anon execute is defense-in-depth.
REVOKE EXECUTE ON FUNCTION public.accept_tournament_invite(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.available_trophies(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dm_check_blocked() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_trophies(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_tournament_room_credentials(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_lovable_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.process_uc_withdrawal(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purchase_trophy_package(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_uc_withdrawal(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.virtual_topup_coins(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_dm_thread(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_server_with_password(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_server_password(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_squad_contact(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.accept_tournament_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.available_trophies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_trophies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_room_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lovable_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_uc_withdrawal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_trophy_package(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_uc_withdrawal(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_topup_coins(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_with_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_server_password(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_squad_contact(uuid) TO authenticated;
