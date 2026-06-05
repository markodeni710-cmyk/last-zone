-- Cascade delete server-related data when a server is removed
CREATE OR REPLACE FUNCTION public.cleanup_server_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages WHERE channel_id IN (SELECT id FROM public.channels WHERE server_id = OLD.id);
  DELETE FROM public.channels WHERE server_id = OLD.id;
  DELETE FROM public.server_members WHERE server_id = OLD.id;
  DELETE FROM public.server_join_requests WHERE server_id = OLD.id;
  DELETE FROM public.server_text_mutes WHERE server_id = OLD.id;
  DELETE FROM public.server_bans WHERE server_id = OLD.id;
  DELETE FROM public.voice_room_participants WHERE server_id = OLD.id;
  DELETE FROM public.voice_room_bans WHERE server_id = OLD.id;
  DELETE FROM public.voice_call_invites WHERE server_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_server_delete_cleanup ON public.servers;
CREATE TRIGGER on_server_delete_cleanup
BEFORE DELETE ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.cleanup_server_on_delete();