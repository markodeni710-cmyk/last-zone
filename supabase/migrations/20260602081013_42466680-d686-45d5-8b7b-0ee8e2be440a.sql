
-- 1) Trophy packages (buying trophies)
CREATE TABLE public.trophy_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  trophies integer NOT NULL CHECK (trophies > 0),
  price_usd numeric NOT NULL CHECK (price_usd >= 0),
  price_label text,
  badge text,
  popular boolean NOT NULL DEFAULT false,
  perks text[] NOT NULL DEFAULT '{}',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trophy_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trophy_packages TO authenticated;
GRANT ALL ON public.trophy_packages TO service_role;

ALTER TABLE public.trophy_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trophy_packages_select_visible_public"
  ON public.trophy_packages FOR SELECT TO anon, authenticated
  USING (visible = true OR public.is_lovable_admin());

CREATE POLICY "trophy_packages_admin_insert"
  ON public.trophy_packages FOR INSERT TO authenticated
  WITH CHECK (public.is_lovable_admin());

CREATE POLICY "trophy_packages_admin_update"
  ON public.trophy_packages FOR UPDATE TO authenticated
  USING (public.is_lovable_admin())
  WITH CHECK (public.is_lovable_admin());

CREATE POLICY "trophy_packages_admin_delete"
  ON public.trophy_packages FOR DELETE TO authenticated
  USING (public.is_lovable_admin());

CREATE TRIGGER trg_trophy_packages_updated_at
  BEFORE UPDATE ON public.trophy_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) UC packages (UC withdrawal)
CREATE TABLE public.uc_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  uc_amount integer NOT NULL CHECK (uc_amount > 0),
  trophies_cost integer NOT NULL CHECK (trophies_cost > 0),
  usd_value numeric NOT NULL CHECK (usd_value >= 0),
  badge text,
  popular boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.uc_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uc_packages TO authenticated;
GRANT ALL ON public.uc_packages TO service_role;

ALTER TABLE public.uc_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_packages_select_visible_public"
  ON public.uc_packages FOR SELECT TO anon, authenticated
  USING (visible = true OR public.is_lovable_admin());

CREATE POLICY "uc_packages_admin_insert"
  ON public.uc_packages FOR INSERT TO authenticated
  WITH CHECK (public.is_lovable_admin());

CREATE POLICY "uc_packages_admin_update"
  ON public.uc_packages FOR UPDATE TO authenticated
  USING (public.is_lovable_admin())
  WITH CHECK (public.is_lovable_admin());

CREATE POLICY "uc_packages_admin_delete"
  ON public.uc_packages FOR DELETE TO authenticated
  USING (public.is_lovable_admin());

CREATE TRIGGER trg_uc_packages_updated_at
  BEFORE UPDATE ON public.uc_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Seed current hardcoded packages
INSERT INTO public.trophy_packages (key, trophies, price_usd, price_label, badge, popular, perks, sort_order) VALUES
  ('starter_100',  100,  1,  '$1',  NULL,         false, ARRAY['مناسبة للتجربة','إضافة فورية'], 10),
  ('bronze_500',   500,  4,  '$4',  'وفّر 20%',   false, ARRAY['قيمة أفضل','إضافة فورية'], 20),
  ('silver_1000',  1000, 7,  '$7',  'الأكثر شراءً', true,  ARRAY['الأكثر طلباً','قيمة ممتازة'], 30),
  ('gold_5000',    5000, 30, '$30', 'وفّر 40%',   false, ARRAY['أفضل صفقة','للمحترفين'], 40);

INSERT INTO public.uc_packages (key, uc_amount, trophies_cost, usd_value, badge, popular, sort_order) VALUES
  ('uc_60',   60,   100,  1,  NULL,            false, 10),
  ('uc_325',  325,  500,  5,  'شائعة',         false, 20),
  ('uc_660',  660,  1000, 10, 'الأكثر سحباً',  true,  30),
  ('uc_1800', 1800, 2500, 25, NULL,            false, 40),
  ('uc_3850', 3850, 5000, 50, 'كبار اللاعبين', false, 50);

-- 4) Replace RPCs to read from tables instead of hardcoded CASE
CREATE OR REPLACE FUNCTION public.purchase_trophy_package(_package_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _pkg public.trophy_packages;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO _pkg FROM public.trophy_packages
   WHERE key = _package_key AND visible = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid package'; END IF;

  INSERT INTO public.admin_trophy_grants (user_id, granted_by, amount, note)
  VALUES (_uid, _uid, _pkg.trophies, 'shop_purchase:' || _pkg.key);

  INSERT INTO public.shop_transactions (user_id, kind, coins_delta, trophies_added, package_key, is_virtual)
  VALUES (_uid, 'purchase', 0, _pkg.trophies, _pkg.key, true);

  RETURN jsonb_build_object('trophies_added', _pkg.trophies);
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_uc_withdrawal(_package_key text, _pubg_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _pkg public.uc_packages;
  _avail integer;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _pubg_id IS NULL OR length(trim(_pubg_id)) < 4 THEN
    RAISE EXCEPTION 'invalid_pubg_id';
  END IF;

  SELECT * INTO _pkg FROM public.uc_packages
   WHERE key = _package_key AND visible = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_package'; END IF;

  _avail := public.available_trophies(_uid);
  IF _avail < _pkg.trophies_cost THEN
    RAISE EXCEPTION 'insufficient_trophies: need %, available %', _pkg.trophies_cost, _avail;
  END IF;

  INSERT INTO public.uc_withdrawal_requests
    (user_id, package_key, uc_amount, trophies_cost, usd_value, pubg_id)
  VALUES (_uid, _pkg.key, _pkg.uc_amount, _pkg.trophies_cost, _pkg.usd_value, trim(_pubg_id))
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;
