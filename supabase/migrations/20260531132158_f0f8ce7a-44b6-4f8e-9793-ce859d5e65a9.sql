ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
ALTER TABLE public.user_blocks REPLICA IDENTITY FULL;