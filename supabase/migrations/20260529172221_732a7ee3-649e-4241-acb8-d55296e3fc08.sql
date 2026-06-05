ALTER TABLE public.server_join_requests REPLICA IDENTITY FULL;
ALTER TABLE public.server_members REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_join_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;