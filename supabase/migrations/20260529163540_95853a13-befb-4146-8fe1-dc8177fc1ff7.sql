-- Create server_bans table to track users banned from servers (kicked or rejected)
CREATE TABLE public.server_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL,
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_bans TO authenticated;
GRANT ALL ON public.server_bans TO service_role;

ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY bans_select_self_or_staff ON public.server_bans FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_bans.server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_bans.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);

CREATE POLICY bans_insert_staff ON public.server_bans FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_bans.server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_bans.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);

CREATE POLICY bans_delete_owner ON public.server_bans FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_bans.server_id AND s.owner_id = auth.uid())
);

-- Prevent banned users from rejoining: update members_insert_self policy
DROP POLICY IF EXISTS members_insert_self ON public.server_members;
CREATE POLICY members_insert_self ON public.server_members FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (SELECT 1 FROM public.server_bans b WHERE b.server_id = server_members.server_id AND b.user_id = auth.uid())
);

-- Also block re-requesting join while banned
DROP POLICY IF EXISTS jr_insert_self ON public.server_join_requests;
CREATE POLICY jr_insert_self ON public.server_join_requests FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (SELECT 1 FROM public.server_bans b WHERE b.server_id = server_join_requests.server_id AND b.user_id = auth.uid())
);