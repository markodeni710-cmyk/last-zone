
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admin can read app_settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (public.is_lovable_admin());

CREATE POLICY "Only admin can insert app_settings"
ON public.app_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_lovable_admin());

CREATE POLICY "Only admin can update app_settings"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.is_lovable_admin())
WITH CHECK (public.is_lovable_admin());

CREATE POLICY "Only admin can delete app_settings"
ON public.app_settings FOR DELETE
TO authenticated
USING (public.is_lovable_admin());
