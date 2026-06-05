ALTER TABLE public.clip_likes REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clip_likes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;