ALTER TABLE public.squad_applications REPLICA IDENTITY FULL;
ALTER TABLE public.squad_listings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_listings;