REVOKE ALL ON FUNCTION public.cleanup_completed_squad_listings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_completed_squad_listings() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_completed_squad_listings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_squad_listing_completion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_squad_listing_completion() FROM anon;
REVOKE ALL ON FUNCTION public.sync_squad_listing_completion() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_squad_listing_completion() TO service_role;