
CREATE TABLE public.voice_room_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL,
  server_id UUID NOT NULL,
  user_id UUID NOT NULL,
  can_speak BOOLEAN NOT NULL DEFAULT false,
  hand_raised BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_room_participants TO authenticated;
GRANT SELECT ON public.voice_room_participants TO anon;
GRANT ALL ON public.voice_room_participants TO service_role;

ALTER TABLE public.voice_room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_select_all" ON public.voice_room_participants
  FOR SELECT USING (true);

CREATE POLICY "voice_join_self" ON public.voice_room_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_leave_self" ON public.voice_room_participants
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );

-- Owner can update can_speak (mic control); user can update own is_muted/hand_raised
CREATE POLICY "voice_update_owner_or_self" ON public.voice_room_participants
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_room_participants;
