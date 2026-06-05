ALTER TABLE public.server_text_mutes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_text_mutes;