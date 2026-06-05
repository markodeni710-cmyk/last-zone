
-- Add columns for PUBG ID, expiry, and timeout tracking on squad applications
ALTER TABLE public.squad_applications
  ADD COLUMN IF NOT EXISTS pubg_id text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes');

-- Cap admin slot selection to 3 (apply to new rows only)
ALTER TABLE public.squad_listings
  DROP CONSTRAINT IF EXISTS squad_listings_slots_max;
ALTER TABLE public.squad_listings
  ADD CONSTRAINT squad_listings_slots_max CHECK (slots_needed BETWEEN 1 AND 3) NOT VALID;

-- Auto-expire pending applications older than 30 minutes
CREATE OR REPLACE FUNCTION public.expire_pending_squad_applications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.squad_applications
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
$$;

-- Schedule the expire function every minute via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-squad-applications') THEN
    PERFORM cron.unschedule('expire-squad-applications');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-squad-applications',
  '* * * * *',
  $$ SELECT public.expire_pending_squad_applications(); $$
);
