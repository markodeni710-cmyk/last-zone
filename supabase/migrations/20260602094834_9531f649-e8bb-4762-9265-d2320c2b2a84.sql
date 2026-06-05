-- Add "admin" co-manager role with same permissions as the owner
-- (except transferring/deleting the server and managing other admins).

-- Helper: is current user a server admin (owner OR role='admin')
CREATE OR REPLACE FUNCTION public.is_server_admin(_server_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND s.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = _server_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
  );
$$;

-- ===== channels: admins can manage channels =====
DROP POLICY IF EXISTS channels_insert_owner ON public.channels;
DROP POLICY IF EXISTS channels_update_owner ON public.channels;
DROP POLICY IF EXISTS channels_delete_owner ON public.channels;

CREATE POLICY channels_insert_admin ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_server_admin(server_id));
CREATE POLICY channels_update_admin ON public.channels FOR UPDATE TO authenticated
  USING (public.is_server_admin(server_id));
CREATE POLICY channels_delete_admin ON public.channels FOR DELETE TO authenticated
  USING (public.is_server_admin(server_id));

-- ===== messages: staff (owner/admin/moderator) can delete =====
DROP POLICY IF EXISTS messages_delete_staff ON public.messages;
CREATE POLICY messages_delete_staff ON public.messages FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE c.id = messages.channel_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','admin','moderator')
  )
  OR EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.servers s ON s.id = c.server_id
    WHERE c.id = messages.channel_id AND s.owner_id = auth.uid()
  )
);

-- ===== server_bans: admins can ban too =====
DROP POLICY IF EXISTS bans_insert_staff ON public.server_bans;
CREATE POLICY bans_insert_staff ON public.server_bans FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_bans.server_id AND s.owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_bans.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('admin','moderator')
  )
);

DROP POLICY IF EXISTS bans_select_self_or_staff ON public.server_bans;
CREATE POLICY bans_select_self_or_staff ON public.server_bans FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_bans.server_id AND s.owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_bans.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('admin','moderator')
  )
);

-- ===== server_text_mutes: include admins =====
DROP POLICY IF EXISTS mutes_insert_staff ON public.server_text_mutes;
DROP POLICY IF EXISTS mutes_update_staff ON public.server_text_mutes;
DROP POLICY IF EXISTS mutes_delete_staff ON public.server_text_mutes;

CREATE POLICY mutes_insert_staff ON public.server_text_mutes FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.server_members sm
  WHERE sm.server_id = server_text_mutes.server_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('owner','admin','moderator')
));
CREATE POLICY mutes_update_staff ON public.server_text_mutes FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.server_members sm
  WHERE sm.server_id = server_text_mutes.server_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('owner','admin','moderator')
));
CREATE POLICY mutes_delete_staff ON public.server_text_mutes FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.server_members sm
  WHERE sm.server_id = server_text_mutes.server_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('owner','admin','moderator')
));

-- ===== server_join_requests: admins can review/delete =====
DROP POLICY IF EXISTS jr_update_staff ON public.server_join_requests;
DROP POLICY IF EXISTS jr_delete_involved ON public.server_join_requests;
DROP POLICY IF EXISTS jr_select_involved ON public.server_join_requests;

CREATE POLICY jr_update_staff ON public.server_join_requests FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_join_requests.server_id AND s.owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_join_requests.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('admin','moderator')
  )
);
CREATE POLICY jr_delete_involved ON public.server_join_requests FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_join_requests.server_id AND s.owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_join_requests.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('admin','moderator')
  )
);
CREATE POLICY jr_select_involved ON public.server_join_requests FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_join_requests.server_id AND s.owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = server_join_requests.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('admin','moderator')
  )
);

-- ===== server_members: owner can manage admins; admins can manage mods/members =====
DROP POLICY IF EXISTS members_update_owner ON public.server_members;
DROP POLICY IF EXISTS members_delete_staff ON public.server_members;

-- Owner: can promote/demote any non-owner to member/moderator/admin
CREATE POLICY members_update_owner ON public.server_members FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
  AND role IN ('member','moderator','admin')
);

-- Admin: can only change non-owner / non-admin members to member or moderator
CREATE POLICY members_update_admin ON public.server_members FOR UPDATE TO authenticated
USING (
  role NOT IN ('owner','admin')
  AND EXISTS (
    SELECT 1 FROM public.server_members me
    WHERE me.server_id = server_members.server_id
      AND me.user_id = auth.uid()
      AND me.role = 'admin'
  )
)
WITH CHECK (
  role IN ('member','moderator')
  AND EXISTS (
    SELECT 1 FROM public.server_members me
    WHERE me.server_id = server_members.server_id
      AND me.user_id = auth.uid()
      AND me.role = 'admin'
  )
);

-- Delete: owner can remove anyone except themselves; admin/mod can remove only non-owner/non-admin
CREATE POLICY members_delete_staff ON public.server_members FOR DELETE TO authenticated
USING (
  (
    role <> 'owner'
    AND EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_members.server_id AND s.owner_id = auth.uid())
  )
  OR (
    role NOT IN ('owner','admin')
    AND EXISTS (
      SELECT 1 FROM public.server_members me
      WHERE me.server_id = server_members.server_id
        AND me.user_id = auth.uid()
        AND me.role IN ('admin','moderator')
    )
  )
);