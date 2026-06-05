
DROP POLICY IF EXISTS servers_select_public ON public.servers;
CREATE POLICY servers_select_all_auth ON public.servers
FOR SELECT TO authenticated, anon
USING (true);
