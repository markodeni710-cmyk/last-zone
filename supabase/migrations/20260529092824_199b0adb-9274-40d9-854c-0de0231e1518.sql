ALTER TABLE public.squad_listings 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;