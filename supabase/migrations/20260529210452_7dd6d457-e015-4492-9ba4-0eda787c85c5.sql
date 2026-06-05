
-- Add TTL column to channels for ephemeral messages
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS message_ttl_seconds integer;

-- Enable extensions for scheduling cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function: delete messages older than their channel TTL
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages m
  USING public.channels c
  WHERE m.channel_id = c.id
    AND c.message_ttl_seconds IS NOT NULL
    AND c.message_ttl_seconds > 0
    AND m.created_at < (now() - make_interval(secs => c.message_ttl_seconds));
END;
$$;

-- Schedule cleanup every 5 minutes (drop existing if any)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-messages');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-expired-messages',
  '*/5 * * * *',
  $$ SELECT public.cleanup_expired_messages(); $$
);
