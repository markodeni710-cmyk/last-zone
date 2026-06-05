
-- 1) player_ratings: restrict reads to authenticated users
DROP POLICY IF EXISTS ratings_select_all ON public.player_ratings;
CREATE POLICY ratings_select_auth ON public.player_ratings
  FOR SELECT TO authenticated USING (true);

-- 2) squad_listings: hide 'contact' from non-owners
DROP POLICY IF EXISTS squads_select_auth ON public.squad_listings;
CREATE POLICY squads_select_own ON public.squad_listings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.squad_listings_v
WITH (security_invoker=off) AS
SELECT id, user_id, title, description, rank, server_region,
       slots_needed, mode, mic_required, status, created_at, expires_at,
       CASE WHEN auth.uid() = user_id THEN contact ELSE NULL END AS contact
FROM public.squad_listings;

REVOKE ALL ON public.squad_listings_v FROM PUBLIC, anon;
GRANT SELECT ON public.squad_listings_v TO authenticated;

-- 3) tournament_registrations: validate organizer_id matches the tournament's organizer
DROP POLICY IF EXISTS treg_insert_self ON public.tournament_registrations;
CREATE POLICY treg_insert_self ON public.tournament_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = captain_id
    AND organizer_id = (
      SELECT t.organizer_id FROM public.tournaments t WHERE t.id = tournament_id
    )
  );

-- 4) voice_room_bans: let moderators insert bans too (parity with server_bans / mutes)
DROP POLICY IF EXISTS bans_insert_owner ON public.voice_room_bans;
CREATE POLICY voice_bans_insert_staff ON public.voice_room_bans
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = voice_room_bans.server_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'moderator'
    )
  );
