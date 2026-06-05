CREATE TABLE public.voice_call_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  server_id uuid NOT NULL,
  channel_name text NOT NULL,
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_call_invites TO authenticated;
GRANT ALL ON public.voice_call_invites TO service_role;

ALTER TABLE public.voice_call_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select_involved" ON public.voice_call_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "invites_insert_self" ON public.voice_call_invites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);

CREATE POLICY "invites_update_recipient" ON public.voice_call_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);

CREATE POLICY "invites_delete_involved" ON public.voice_call_invites
  FOR DELETE TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);

CREATE INDEX idx_voice_invites_to ON public.voice_call_invites (to_user, status, expires_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_call_invites;