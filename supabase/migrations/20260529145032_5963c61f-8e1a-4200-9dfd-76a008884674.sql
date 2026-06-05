CREATE TABLE public.voice_room_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  server_id uuid NOT NULL,
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_room_bans TO authenticated;
GRANT ALL ON public.voice_room_bans TO service_role;

ALTER TABLE public.voice_room_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bans_select_all" ON public.voice_room_bans
  FOR SELECT USING (true);

CREATE POLICY "bans_insert_owner" ON public.voice_room_bans
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = voice_room_bans.server_id AND s.owner_id = auth.uid()));

CREATE POLICY "bans_update_owner" ON public.voice_room_bans
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = voice_room_bans.server_id AND s.owner_id = auth.uid()));

CREATE POLICY "bans_delete_owner_or_self" ON public.voice_room_bans
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = voice_room_bans.server_id AND s.owner_id = auth.uid())
    OR auth.uid() = user_id
  );

CREATE INDEX idx_voice_room_bans_lookup ON public.voice_room_bans (channel_id, user_id, expires_at);