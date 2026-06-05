
REVOKE EXECUTE ON FUNCTION public.dm_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dm_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_dm_thread(UUID) FROM PUBLIC, anon;
