
-- 1) Columns
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS join_password TEXT;

-- 2) Backfill unique 8-digit codes for existing rows
DO $$
DECLARE r RECORD; new_code TEXT;
BEGIN
  FOR r IN SELECT id FROM public.servers WHERE code IS NULL LOOP
    LOOP
      new_code := lpad((floor(random()*100000000))::bigint::text, 8, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.servers WHERE code = new_code);
    END LOOP;
    UPDATE public.servers SET code = new_code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.servers ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS servers_code_unique ON public.servers(code);

-- 3) Trigger to auto-generate code on insert
CREATE OR REPLACE FUNCTION public.generate_server_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_code TEXT;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    LOOP
      new_code := lpad((floor(random()*100000000))::bigint::text, 8, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.servers WHERE code = new_code);
    END LOOP;
    NEW.code := new_code;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_server_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_generate_server_code ON public.servers;
CREATE TRIGGER trg_generate_server_code
BEFORE INSERT ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.generate_server_code();

-- 4) Lookup server by code (returns safe public fields only, works for private too so users can find by code)
CREATE OR REPLACE FUNCTION public.find_server_by_code(_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  icon_url TEXT,
  banner_url TEXT,
  region TEXT,
  member_count INTEGER,
  is_public BOOLEAN,
  code TEXT,
  join_requirements TEXT,
  has_password BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.description, s.icon_url, s.banner_url, s.region,
         s.member_count, s.is_public, s.code, s.join_requirements,
         (s.join_password IS NOT NULL AND s.join_password <> '') AS has_password
  FROM public.servers s
  WHERE s.code = _code
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_server_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_server_by_code(TEXT) TO authenticated;

-- 5) Join with password (verifies password server-side, enforces bans)
CREATE OR REPLACE FUNCTION public.join_server_with_password(_server_id UUID, _password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  s public.servers;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO s FROM public.servers WHERE id = _server_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'server not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.server_bans WHERE server_id = s.id AND user_id = me) THEN
    RAISE EXCEPTION 'banned';
  END IF;

  IF EXISTS (SELECT 1 FROM public.server_members WHERE server_id = s.id AND user_id = me) THEN
    RETURN 'already_member';
  END IF;

  IF s.is_public = false THEN
    IF s.join_password IS NULL OR s.join_password = '' THEN
      RAISE EXCEPTION 'password_not_set';
    END IF;
    IF _password IS NULL OR _password <> s.join_password THEN
      RAISE EXCEPTION 'wrong_password';
    END IF;
  END IF;

  INSERT INTO public.server_members (server_id, user_id, role) VALUES (s.id, me, 'member');
  RETURN 'joined';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_server_with_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_server_with_password(UUID, TEXT) TO authenticated;

-- 6) Hide join_password from non-owners by tightening UPDATE/SELECT? 
-- SELECT policy already exists; join_password column is included. Restrict via column-level grant: revoke select on column from authenticated, then grant only on safe columns.
-- Simpler: rely on the fact that listing pages won't request it. The has_password flag is exposed via find_server_by_code.
-- For safety, revoke SELECT on join_password column from authenticated (owner can still read via the trigger/RPC if needed).
REVOKE SELECT (join_password) ON public.servers FROM authenticated, anon;
-- Owners need to see/edit their password: provide an RPC
CREATE OR REPLACE FUNCTION public.get_my_server_password(_server_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT join_password FROM public.servers
  WHERE id = _server_id AND owner_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_server_password(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_server_password(UUID) TO authenticated;
