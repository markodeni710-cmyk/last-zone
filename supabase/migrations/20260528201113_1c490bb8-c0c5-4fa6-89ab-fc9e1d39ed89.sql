
-- Drop streams (feature removed)
DROP TABLE IF EXISTS public.streams CASCADE;

-- Expand profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS kd numeric,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS mic_available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS availability text;

-- Clips (TikTok-style short videos / posts)
CREATE TABLE public.clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caption text,
  video_url text,
  thumbnail_url text,
  tag text,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clips TO authenticated;
GRANT ALL ON public.clips TO service_role;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY clips_select_all ON public.clips FOR SELECT USING (true);
CREATE POLICY clips_insert_own ON public.clips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY clips_update_own ON public.clips FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY clips_delete_own ON public.clips FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.clips
  ADD CONSTRAINT clips_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Clip likes
CREATE TABLE public.clip_likes (
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (clip_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.clip_likes TO authenticated;
GRANT ALL ON public.clip_likes TO service_role;
ALTER TABLE public.clip_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY clip_likes_select_all ON public.clip_likes FOR SELECT USING (true);
CREATE POLICY clip_likes_insert_own ON public.clip_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY clip_likes_delete_own ON public.clip_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger to maintain likes_count
CREATE OR REPLACE FUNCTION public.handle_clip_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.clips SET likes_count = likes_count + 1 WHERE id = NEW.clip_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clips SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.clip_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER clip_likes_count_trg
AFTER INSERT OR DELETE ON public.clip_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_clip_like();

-- Player ratings
CREATE TABLE public.player_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id uuid NOT NULL,
  rated_id uuid NOT NULL,
  respectful boolean DEFAULT false,
  has_mic boolean DEFAULT false,
  skilled boolean DEFAULT false,
  punctual boolean DEFAULT false,
  no_toxic boolean DEFAULT false,
  no_quit boolean DEFAULT false,
  tournament_ready boolean DEFAULT false,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (rater_id, rated_id),
  CHECK (rater_id <> rated_id)
);
GRANT SELECT ON public.player_ratings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_ratings TO authenticated;
GRANT ALL ON public.player_ratings TO service_role;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ratings_select_all ON public.player_ratings FOR SELECT USING (true);
CREATE POLICY ratings_insert_own ON public.player_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = rater_id);
CREATE POLICY ratings_update_own ON public.player_ratings FOR UPDATE TO authenticated USING (auth.uid() = rater_id);
CREATE POLICY ratings_delete_own ON public.player_ratings FOR DELETE TO authenticated USING (auth.uid() = rater_id);
