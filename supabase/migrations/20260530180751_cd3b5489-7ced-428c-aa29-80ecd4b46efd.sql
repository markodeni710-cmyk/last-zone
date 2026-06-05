
-- =========================================================
-- Helper: is_server_member (avoids RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = _server_id AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_server_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_server_member(uuid) TO authenticated, service_role;

-- =========================================================
-- servers: anon sees only public; auth sees public + own/member
-- =========================================================
DROP POLICY IF EXISTS servers_select_all_auth ON public.servers;

CREATE POLICY servers_select_public_anon ON public.servers
  FOR SELECT TO anon
  USING (is_public = true);

CREATE POLICY servers_select_auth ON public.servers
  FOR SELECT TO authenticated
  USING (is_public = true OR owner_id = auth.uid() OR public.is_server_member(id));

-- =========================================================
-- channels: members only
-- =========================================================
DROP POLICY IF EXISTS channels_select_all ON public.channels;

CREATE POLICY channels_select_members ON public.channels
  FOR SELECT TO authenticated
  USING (public.is_server_member(server_id));

-- =========================================================
-- messages: members only
-- =========================================================
DROP POLICY IF EXISTS messages_select_all ON public.messages;

CREATE POLICY messages_select_members ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = messages.channel_id
        AND public.is_server_member(c.server_id)
    )
  );

-- =========================================================
-- server_members: members of same server only (or self)
-- =========================================================
DROP POLICY IF EXISTS members_select_all ON public.server_members;

CREATE POLICY members_select_same_server ON public.server_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_server_member(server_id));

-- Tighten self-insert: only role='member' allowed
DROP POLICY IF EXISTS members_insert_self ON public.server_members;

CREATE POLICY members_insert_self ON public.server_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
    AND NOT EXISTS (
      SELECT 1 FROM public.server_bans b
      WHERE b.server_id = server_members.server_id AND b.user_id = auth.uid()
    )
  );

-- =========================================================
-- server_text_mutes: members only see; self can see own mute
-- =========================================================
DROP POLICY IF EXISTS mutes_select_all ON public.server_text_mutes;

CREATE POLICY mutes_select_members ON public.server_text_mutes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_server_member(server_id));

-- =========================================================
-- voice_room_participants: members only
-- =========================================================
DROP POLICY IF EXISTS voice_select_all ON public.voice_room_participants;

CREATE POLICY voice_select_members ON public.voice_room_participants
  FOR SELECT TO authenticated
  USING (public.is_server_member(server_id));

-- =========================================================
-- voice_room_bans: self or staff
-- =========================================================
DROP POLICY IF EXISTS bans_select_all ON public.voice_room_bans;

CREATE POLICY voice_bans_select_self_or_staff ON public.voice_room_bans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = voice_room_bans.server_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = voice_room_bans.server_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'moderator'
    )
  );

-- =========================================================
-- squad_listings: authenticated only (contact info)
-- =========================================================
DROP POLICY IF EXISTS squads_select_all ON public.squad_listings;

CREATE POLICY squads_select_auth ON public.squad_listings
  FOR SELECT TO authenticated
  USING (true);

-- =========================================================
-- tournament_registrations: captain, organizer, or member listed
-- =========================================================
DROP POLICY IF EXISTS treg_select_all ON public.tournament_registrations;

CREATE POLICY treg_select_involved ON public.tournament_registrations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = captain_id
    OR auth.uid() = organizer_id
  );

-- =========================================================
-- realtime.messages: restrict subscriptions
-- App only uses presence:online-users channel; postgres_changes uses publication, not this table
-- =========================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can use presence channel" ON realtime.messages;

CREATE POLICY "Authenticated can use presence channel" ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() = 'presence:online-users');

DROP POLICY IF EXISTS "Authenticated can write presence channel" ON realtime.messages;

CREATE POLICY "Authenticated can write presence channel" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() = 'presence:online-users');

-- =========================================================
-- Storage: avatars bucket — prevent listing all files
-- Public URLs still work (CDN); only the LIST operation is blocked
-- =========================================================
DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Users can upload/update/delete only their own folder
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- No SELECT policy on storage.objects for the avatars bucket:
-- public reads still work via the CDN public URL, but LIST is blocked.

-- =========================================================
-- Lock down SECURITY DEFINER trigger/cron functions from direct call
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_server() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_clip_like() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_server_member_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_server_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dm_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dm_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- get_or_create_dm_thread is an RPC that authenticated users intentionally call
