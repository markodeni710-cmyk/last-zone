
CREATE OR REPLACE FUNCTION public.purchase_trophy_package(_package_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _trophies integer;
  _price_usd numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  CASE _package_key
    WHEN 'starter_100'   THEN _trophies := 100;  _price_usd := 1;
    WHEN 'bronze_500'    THEN _trophies := 500;  _price_usd := 4;
    WHEN 'silver_1000'   THEN _trophies := 1000; _price_usd := 7;
    WHEN 'gold_5000'     THEN _trophies := 5000; _price_usd := 30;
    ELSE RAISE EXCEPTION 'invalid package';
  END CASE;

  -- Virtual mode: grant trophies directly (real payment check will be added later)
  INSERT INTO public.admin_trophy_grants (user_id, granted_by, amount, note)
  VALUES (_uid, _uid, _trophies, 'shop_purchase:' || _package_key);

  INSERT INTO public.shop_transactions (user_id, kind, coins_delta, trophies_added, package_key, is_virtual)
  VALUES (_uid, 'purchase', 0, _trophies, _package_key, true);

  RETURN jsonb_build_object('trophies_added', _trophies);
END;
$$;
