ALTER TABLE public.trophy_packages REPLICA IDENTITY FULL;
ALTER TABLE public.uc_packages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trophy_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.uc_packages;