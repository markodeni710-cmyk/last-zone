ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS live_stream_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_stream_started_at timestamptz;

ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tournaments';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments';
  END IF;
END $$;