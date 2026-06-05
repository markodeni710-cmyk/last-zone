
-- Create UC withdrawal requests table
CREATE TABLE public.uc_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_key text NOT NULL,
  uc_amount integer NOT NULL,
  trophies_cost integer NOT NULL,
  usd_value numeric NOT NULL,
  pubg_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

GRANT SELECT, INSERT ON public.uc_withdrawal_requests TO authenticated;
GRANT ALL ON public.uc_withdrawal_requests TO service_role;

ALTER TABLE public.uc_withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own withdrawals"
ON public.uc_withdrawal_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_lovable_admin());

CREATE POLICY "admin update withdrawals"
ON public.uc_withdrawal_requests FOR UPDATE TO authenticated
USING (is_lovable_admin());

-- Update available_trophies to subtract pending/approved withdrawals
CREATE OR REPLACE FUNCTION public.available_trophies(_user uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(CASE
        WHEN COALESCE(array_length(res.recipient_ids, 1), 0) > 0 AND _user = ANY(res.recipient_ids)
          THEN GREATEST(res.trophies_awarded / array_length(res.recipient_ids, 1), 0)
        ELSE 0 END)::int
      FROM public.tournament_results res
    ), 0)
    + COALESCE((SELECT SUM(amount)::int FROM public.admin_trophy_grants WHERE user_id = _user), 0)
    - COALESCE((SELECT SUM(trophies_count)::int FROM public.tournaments
                WHERE organizer_id = _user AND status <> 'finished'), 0)
    - COALESCE((SELECT SUM(trophies_cost)::int FROM public.uc_withdrawal_requests
                WHERE user_id = _user AND status IN ('pending','approved')), 0),
    0
  );
$function$;

-- RPC to create a withdrawal request, validating balance
CREATE OR REPLACE FUNCTION public.request_uc_withdrawal(_package_key text, _pubg_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _uc integer;
  _cost integer;
  _usd numeric;
  _avail integer;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _pubg_id IS NULL OR length(trim(_pubg_id)) < 4 THEN
    RAISE EXCEPTION 'invalid_pubg_id';
  END IF;

  CASE _package_key
    WHEN 'uc_60'   THEN _uc := 60;   _cost := 100;  _usd := 1;
    WHEN 'uc_325'  THEN _uc := 325;  _cost := 500;  _usd := 5;
    WHEN 'uc_660'  THEN _uc := 660;  _cost := 1000; _usd := 10;
    WHEN 'uc_1800' THEN _uc := 1800; _cost := 2500; _usd := 25;
    WHEN 'uc_3850' THEN _uc := 3850; _cost := 5000; _usd := 50;
    ELSE RAISE EXCEPTION 'invalid_package';
  END CASE;

  _avail := public.available_trophies(_uid);
  IF _avail < _cost THEN
    RAISE EXCEPTION 'insufficient_trophies: need %, available %', _cost, _avail;
  END IF;

  INSERT INTO public.uc_withdrawal_requests
    (user_id, package_key, uc_amount, trophies_cost, usd_value, pubg_id)
  VALUES (_uid, _package_key, _uc, _cost, _usd, trim(_pubg_id))
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;
