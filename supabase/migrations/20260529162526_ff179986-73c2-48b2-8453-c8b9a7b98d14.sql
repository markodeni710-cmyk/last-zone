
CREATE POLICY members_insert_staff ON public.server_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role = 'moderator')
);
