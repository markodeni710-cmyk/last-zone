ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique ON public.profiles (lower(username));