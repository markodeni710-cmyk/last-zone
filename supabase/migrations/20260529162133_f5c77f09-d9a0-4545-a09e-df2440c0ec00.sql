
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS join_requirements text;

CREATE TABLE IF NOT EXISTS public.server_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  UNIQUE (server_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_join_requests TO authenticated;
GRANT ALL ON public.server_join_requests TO service_role;

ALTER TABLE public.server_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jr_select_involved" ON public.server_join_requests
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_join_requests.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);

CREATE POLICY "jr_insert_self" ON public.server_join_requests
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "jr_delete_involved" ON public.server_join_requests
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_join_requests.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);

CREATE POLICY "jr_update_staff" ON public.server_join_requests
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_join_requests.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);
