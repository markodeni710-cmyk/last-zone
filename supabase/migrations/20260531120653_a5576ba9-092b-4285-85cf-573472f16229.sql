CREATE OR REPLACE FUNCTION public.handle_server_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.servers SET member_count = member_count + 1 WHERE id = NEW.server_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When server deletion cleanup removes members from inside another trigger,
    -- do not update the same server row that is being deleted.
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;

    UPDATE public.servers
       SET member_count = GREATEST(member_count - 1, 0)
     WHERE id = OLD.server_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_server_delete_cleanup ON public.servers;
CREATE TRIGGER on_server_delete_cleanup
AFTER DELETE ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.cleanup_server_on_delete();