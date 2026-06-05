CREATE OR REPLACE FUNCTION public.sync_squad_listing_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _listing_id uuid;
  _slots_needed integer;
  _accepted_count integer;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);

  IF _listing_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT slots_needed
    INTO _slots_needed
  FROM public.squad_listings
  WHERE id = _listing_id;

  IF _slots_needed IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*)::integer
    INTO _accepted_count
  FROM public.squad_applications
  WHERE listing_id = _listing_id
    AND status = 'accepted';

  IF _accepted_count >= _slots_needed THEN
    UPDATE public.squad_listings
       SET completed_at = COALESCE(completed_at, now())
     WHERE id = _listing_id
       AND completed_at IS NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS squad_applications_sync_listing_completion ON public.squad_applications;

CREATE TRIGGER squad_applications_sync_listing_completion
AFTER INSERT OR UPDATE OF status OR DELETE ON public.squad_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_squad_listing_completion();

UPDATE public.squad_listings l
   SET completed_at = now()
 WHERE completed_at IS NULL
   AND (
     SELECT COUNT(*)
     FROM public.squad_applications a
     WHERE a.listing_id = l.id
       AND a.status = 'accepted'
   ) >= l.slots_needed;

GRANT EXECUTE ON FUNCTION public.cleanup_completed_squad_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_squad_listing_completion() TO authenticated, service_role;