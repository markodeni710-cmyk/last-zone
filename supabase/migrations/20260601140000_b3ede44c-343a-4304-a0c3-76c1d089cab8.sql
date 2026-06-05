ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;