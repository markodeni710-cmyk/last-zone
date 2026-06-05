
-- Mutes for restricting users from sending messages in a server
CREATE TABLE public.server_text_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL,
  user_id uuid NOT NULL,
  muted_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_text_mutes TO authenticated;
GRANT SELECT ON public.server_text_mutes TO anon;
GRANT ALL ON public.server_text_mutes TO service_role;

ALTER TABLE public.server_text_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mutes_select_all" ON public.server_text_mutes FOR SELECT USING (true);

-- Owner or moderator can mute users
CREATE POLICY "mutes_insert_staff" ON public.server_text_mutes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_text_mutes.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','moderator')
  )
);

CREATE POLICY "mutes_delete_staff" ON public.server_text_mutes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_text_mutes.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','moderator')
  )
);

CREATE POLICY "mutes_update_staff" ON public.server_text_mutes FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_text_mutes.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','moderator')
  )
);

-- Allow server owner to UPDATE member roles (promote/demote moderator)
CREATE POLICY "members_update_owner" ON public.server_members FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
  AND role IN ('member','moderator')
);

-- Allow server owner / moderator to remove (kick) members; owner cannot be kicked
CREATE POLICY "members_delete_staff" ON public.server_members FOR DELETE TO authenticated
USING (
  server_members.role <> 'owner' AND (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = server_members.server_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'moderator'
    )
  )
);

-- Allow owner/moderator to delete any message in their server
CREATE POLICY "messages_delete_staff" ON public.messages FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE c.id = messages.channel_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','moderator')
  )
);

-- Block muted users from inserting messages
DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.server_text_mutes m
    JOIN public.channels c ON c.server_id = m.server_id
    WHERE c.id = messages.channel_id
      AND m.user_id = auth.uid()
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
);
