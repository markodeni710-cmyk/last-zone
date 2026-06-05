
-- 1) Unique membership + auto member_count
ALTER TABLE public.server_members ADD CONSTRAINT server_members_unique UNIQUE (server_id, user_id);

CREATE OR REPLACE FUNCTION public.handle_server_member_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.servers SET member_count = member_count + 1 WHERE id = NEW.server_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.servers SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.server_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_server_member_change
AFTER INSERT OR DELETE ON public.server_members
FOR EACH ROW EXECUTE FUNCTION public.handle_server_member_change();

-- 2) Squad applications
CREATE TABLE public.squad_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL,
  applicant_id UUID NOT NULL,
  listing_owner_id UUID NOT NULL,
  message TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, applicant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_applications TO authenticated;
GRANT ALL ON public.squad_applications TO service_role;
ALTER TABLE public.squad_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apps_select_involved" ON public.squad_applications FOR SELECT TO authenticated
USING (auth.uid() = applicant_id OR auth.uid() = listing_owner_id);
CREATE POLICY "apps_insert_self" ON public.squad_applications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = applicant_id);
CREATE POLICY "apps_update_owner" ON public.squad_applications FOR UPDATE TO authenticated
USING (auth.uid() = listing_owner_id);
CREATE POLICY "apps_delete_own" ON public.squad_applications FOR DELETE TO authenticated
USING (auth.uid() = applicant_id OR auth.uid() = listing_owner_id);

-- 3) Tournament registrations
CREATE TABLE public.tournament_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  captain_id UUID NOT NULL,
  organizer_id UUID NOT NULL,
  team_name TEXT NOT NULL,
  members TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, captain_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_registrations TO authenticated;
GRANT ALL ON public.tournament_registrations TO service_role;
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treg_select_all" ON public.tournament_registrations FOR SELECT USING (true);
CREATE POLICY "treg_insert_self" ON public.tournament_registrations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = captain_id);
CREATE POLICY "treg_update_organizer" ON public.tournament_registrations FOR UPDATE TO authenticated
USING (auth.uid() = organizer_id);
CREATE POLICY "treg_delete_own" ON public.tournament_registrations FOR DELETE TO authenticated
USING (auth.uid() = captain_id OR auth.uid() = organizer_id);

-- 4) Clip comments
CREATE TABLE public.clip_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clip_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clip_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clip_comments TO authenticated;
GRANT ALL ON public.clip_comments TO service_role;
ALTER TABLE public.clip_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_all" ON public.clip_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON public.clip_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.clip_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);
