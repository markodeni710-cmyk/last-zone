REVOKE EXECUTE ON FUNCTION public.cleanup_server_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_server_member_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_server_on_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_server_member_change() TO service_role;