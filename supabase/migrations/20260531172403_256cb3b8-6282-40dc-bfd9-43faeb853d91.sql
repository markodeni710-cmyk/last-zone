
-- Per-clip comment bans
CREATE TABLE public.clip_comment_bans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clip_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.clip_comment_bans TO authenticated;
GRANT ALL ON public.clip_comment_bans TO service_role;

ALTER TABLE public.clip_comment_bans ENABLE ROW LEVEL SECURITY;

-- Clip owner can ban
CREATE POLICY ccb_insert_owner ON public.clip_comment_bans
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = banned_by
  AND EXISTS (SELECT 1 FROM public.clips c WHERE c.id = clip_id AND c.user_id = auth.uid())
);

CREATE POLICY ccb_delete_owner ON public.clip_comment_bans
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.clips c WHERE c.id = clip_id AND c.user_id = auth.uid())
);

-- Anyone authenticated can read (to know if they're banned, and to display)
CREATE POLICY ccb_select_all ON public.clip_comment_bans
FOR SELECT TO authenticated USING (true);

-- Allow clip owner to delete ANY comment on their clip
CREATE POLICY comments_delete_clip_owner ON public.clip_comments
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.clips c WHERE c.id = clip_comments.clip_id AND c.user_id = auth.uid())
);

-- Block banned users from commenting via tightened insert policy
DROP POLICY IF EXISTS comments_insert_own ON public.clip_comments;
CREATE POLICY comments_insert_own ON public.clip_comments
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.clip_comment_bans b
    WHERE b.clip_id = clip_comments.clip_id AND b.user_id = auth.uid()
  )
);

-- Multiple hashtags column
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS tags text[];
