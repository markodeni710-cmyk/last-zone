
ALTER TABLE public.clips REPLICA IDENTITY FULL;
ALTER TABLE public.clip_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clips;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clip_comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
