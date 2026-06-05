
-- Virtual wallet system for trophy shop (placeholder before real payments)
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  coins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallets_select_own ON public.user_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wallets_insert_own ON public.user_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shop_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- 'topup' | 'purchase'
  coins_delta integer NOT NULL,
  trophies_added integer NOT NULL DEFAULT 0,
  package_key text,
  is_virtual boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_transactions TO authenticated;
GRANT ALL ON public.shop_transactions TO service_role;
ALTER TABLE public.shop_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tx_select_own ON public.shop_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Virtual top-up (placeholder for real payment)
CREATE OR REPLACE FUNCTION public.virtual_topup_coins(_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _amount <= 0 OR _amount > 10000 THEN RAISE EXCEPTION 'invalid amount'; END IF;

  INSERT INTO public.user_wallets (user_id, coins) VALUES (_uid, _amount)
  ON CONFLICT (user_id) DO UPDATE SET coins = user_wallets.coins + _amount, updated_at = now()
  RETURNING coins INTO _new_balance;

  INSERT INTO public.shop_transactions (user_id, kind, coins_delta, package_key, is_virtual)
  VALUES (_uid, 'topup', _amount, 'virtual_topup', true);

  RETURN _new_balance;
END;
$$;

-- Purchase a trophy package using coins
CREATE OR REPLACE FUNCTION public.purchase_trophy_package(_package_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cost integer;
  _trophies integer;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  CASE _package_key
    WHEN 'starter_100'   THEN _cost := 100;  _trophies := 100;
    WHEN 'bronze_500'    THEN _cost := 450;  _trophies := 500;
    WHEN 'silver_1000'   THEN _cost := 850;  _trophies := 1000;
    WHEN 'gold_5000'     THEN _cost := 4000; _trophies := 5000;
    ELSE RAISE EXCEPTION 'invalid package';
  END CASE;

  -- Ensure wallet exists
  INSERT INTO public.user_wallets (user_id, coins) VALUES (_uid, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_wallets
  SET coins = coins - _cost, updated_at = now()
  WHERE user_id = _uid AND coins >= _cost
  RETURNING coins INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient coins';
  END IF;

  -- Add trophies via admin_trophy_grants (granted_by = self for purchases)
  INSERT INTO public.admin_trophy_grants (user_id, granted_by, amount, note)
  VALUES (_uid, _uid, _trophies, 'shop_purchase:' || _package_key);

  INSERT INTO public.shop_transactions (user_id, kind, coins_delta, trophies_added, package_key, is_virtual)
  VALUES (_uid, 'purchase', -_cost, _trophies, _package_key, true);

  RETURN jsonb_build_object('coins', _new_balance, 'trophies_added', _trophies);
END;
$$;

-- Allow self-purchase grants (bypass existing admin-only RLS check on INSERT via SECURITY DEFINER)
-- Function runs as definer, so RLS still applies to caller. We need a policy or run as superuser.
-- SECURITY DEFINER bypasses RLS only if function owner has BYPASSRLS or via SET. Add explicit policy:
CREATE POLICY shop_self_grants_insert ON public.admin_trophy_grants
  FOR INSERT TO authenticated
  WITH CHECK (granted_by = auth.uid() AND user_id = auth.uid() AND note LIKE 'shop_purchase:%');
