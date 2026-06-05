ALTER TABLE public.squad_listings ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Cleanup function: delete listings completed more than 3 minutes ago
CREATE OR REPLACE FUNCTION public.cleanup_completed_squad_listings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.squad_listings
  WHERE completed_at IS NOT NULL
    AND completed_at < (now() - interval '3 minutes');
$$;

-- Schedule cron job every minute (fallback in case client doesn't auto-delete)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-completed-squads') THEN
    PERFORM cron.schedule('cleanup-completed-squads', '* * * * *', $cron$SELECT public.cleanup_completed_squad_listings();$cron$);
  END IF;
END $$;