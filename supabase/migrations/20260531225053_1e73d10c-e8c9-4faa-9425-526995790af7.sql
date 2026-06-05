GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_listings TO authenticated;
GRANT ALL ON public.squad_listings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_applications TO authenticated;
GRANT ALL ON public.squad_applications TO service_role;