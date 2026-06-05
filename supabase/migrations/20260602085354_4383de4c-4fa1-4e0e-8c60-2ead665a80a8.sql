-- Account sessions tracking for multi-account detection
CREATE TABLE public.account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_hash text NOT NULL,
  ip_prefix text,
  country_code text,
  fingerprint text,
  user_agent text,
  asn text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_sessions_user ON public.account_sessions(user_id);
CREATE INDEX idx_account_sessions_ip_hash ON public.account_sessions(ip_hash);
CREATE INDEX idx_account_sessions_fingerprint ON public.account_sessions(fingerprint);
CREATE INDEX idx_account_sessions_last_seen ON public.account_sessions(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.account_sessions TO authenticated;
GRANT ALL ON public.account_sessions TO service_role;

ALTER TABLE public.account_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can read; inserts go through SECURITY DEFINER function
CREATE POLICY "admin_read_sessions" ON public.account_sessions
  FOR SELECT TO authenticated
  USING (public.is_lovable_admin());

-- Record session (SECURITY DEFINER so it bypasses RLS for insert)
CREATE OR REPLACE FUNCTION public.record_account_session(
  _ip_hash text,
  _ip_prefix text,
  _country_code text,
  _fingerprint text,
  _user_agent text,
  _asn text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  -- Upsert: if same user + ip_hash + fingerprint exists in last 24h, update last_seen_at
  SELECT id INTO _existing
  FROM public.account_sessions
  WHERE user_id = _uid
    AND ip_hash = _ip_hash
    AND COALESCE(fingerprint,'') = COALESCE(_fingerprint,'')
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.account_sessions
       SET last_seen_at = now(),
           country_code = COALESCE(_country_code, country_code),
           user_agent = COALESCE(_user_agent, user_agent),
           asn = COALESCE(_asn, asn),
           ip_prefix = COALESCE(_ip_prefix, ip_prefix)
     WHERE id = _existing;
  ELSE
    INSERT INTO public.account_sessions
      (user_id, ip_hash, ip_prefix, country_code, fingerprint, user_agent, asn)
    VALUES
      (_uid, _ip_hash, _ip_prefix, _country_code, _fingerprint, _user_agent, _asn);
  END IF;
END;
$$;

-- Admin view: groups of accounts sharing IP or fingerprint
CREATE OR REPLACE FUNCTION public.get_suspicious_accounts()
RETURNS TABLE (
  match_type text,
  match_value text,
  user_ids uuid[],
  usernames text[],
  account_count integer,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_lovable_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  -- IP-based matches
  SELECT
    'ip'::text AS match_type,
    s.ip_hash AS match_value,
    array_agg(DISTINCT s.user_id) AS user_ids,
    array_agg(DISTINCT p.username) AS usernames,
    COUNT(DISTINCT s.user_id)::int AS account_count,
    MAX(s.last_seen_at) AS last_seen_at
  FROM public.account_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  GROUP BY s.ip_hash
  HAVING COUNT(DISTINCT s.user_id) > 1

  UNION ALL

  -- Fingerprint-based matches
  SELECT
    'fingerprint'::text,
    s.fingerprint,
    array_agg(DISTINCT s.user_id),
    array_agg(DISTINCT p.username),
    COUNT(DISTINCT s.user_id)::int,
    MAX(s.last_seen_at)
  FROM public.account_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.fingerprint IS NOT NULL AND s.fingerprint <> ''
  GROUP BY s.fingerprint
  HAVING COUNT(DISTINCT s.user_id) > 1

  ORDER BY last_seen_at DESC;
END;
$$;