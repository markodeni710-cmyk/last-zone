-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  pubg_id TEXT,
  rank TEXT,
  preferred_server TEXT,
  sensitivity JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', 'لاعب جديد'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- SERVERS (clans)
-- =========================================
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  banner_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  region TEXT,
  tags TEXT[],
  member_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.servers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers_select_public" ON public.servers FOR SELECT USING (is_public OR auth.uid() = owner_id);
CREATE POLICY "servers_insert_own" ON public.servers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "servers_update_own" ON public.servers FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "servers_delete_own" ON public.servers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- =========================================
-- SERVER MEMBERS
-- =========================================
CREATE TABLE public.server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);
GRANT SELECT ON public.server_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.server_members TO authenticated;
GRANT ALL ON public.server_members TO service_role;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_all" ON public.server_members FOR SELECT USING (true);
CREATE POLICY "members_insert_self" ON public.server_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_delete_self" ON public.server_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Auto-add owner as member + maintain member_count
CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.server_members (server_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  INSERT INTO public.channels (server_id, name, type, position) VALUES
    (NEW.id, 'عام', 'text', 0),
    (NEW.id, 'سكريمات', 'text', 1),
    (NEW.id, 'فويس-عام', 'voice', 2);
  RETURN NEW;
END;
$$;

-- =========================================
-- CHANNELS
-- =========================================
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.channels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_select_all" ON public.channels FOR SELECT USING (true);
CREATE POLICY "channels_insert_owner" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));
CREATE POLICY "channels_update_owner" ON public.channels FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));
CREATE POLICY "channels_delete_owner" ON public.channels FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

DROP TRIGGER IF EXISTS on_server_created ON public.servers;
CREATE TRIGGER on_server_created AFTER INSERT ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();

-- =========================================
-- MESSAGES
-- =========================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_channel ON public.messages(channel_id, created_at DESC);
GRANT SELECT ON public.messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_all" ON public.messages FOR SELECT USING (true);
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- =========================================
-- SQUAD LISTINGS
-- =========================================
CREATE TABLE public.squad_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  rank TEXT,
  server_region TEXT,
  mode TEXT,
  slots_needed INT NOT NULL DEFAULT 1,
  mic_required BOOLEAN NOT NULL DEFAULT false,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.squad_listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.squad_listings TO authenticated;
GRANT ALL ON public.squad_listings TO service_role;
ALTER TABLE public.squad_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "squads_select_all" ON public.squad_listings FOR SELECT USING (true);
CREATE POLICY "squads_insert_own" ON public.squad_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "squads_update_own" ON public.squad_listings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "squads_delete_own" ON public.squad_listings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- TOURNAMENTS
-- =========================================
CREATE TABLE public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prize_pool TEXT,
  mode TEXT,
  max_teams INT NOT NULL DEFAULT 16,
  starts_at TIMESTAMPTZ,
  banner_url TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournaments_select_all" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_insert_own" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "tournaments_update_own" ON public.tournaments FOR UPDATE TO authenticated USING (auth.uid() = organizer_id);
CREATE POLICY "tournaments_delete_own" ON public.tournaments FOR DELETE TO authenticated USING (auth.uid() = organizer_id);

-- =========================================
-- STREAMS
-- =========================================
CREATE TABLE public.streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'youtube',
  stream_url TEXT NOT NULL,
  thumbnail_url TEXT,
  viewers INT NOT NULL DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.streams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.streams TO authenticated;
GRANT ALL ON public.streams TO service_role;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "streams_select_all" ON public.streams FOR SELECT USING (true);
CREATE POLICY "streams_insert_own" ON public.streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "streams_update_own" ON public.streams FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "streams_delete_own" ON public.streams FOR DELETE TO authenticated USING (auth.uid() = user_id);