-- Allow admin to insert notifications (for processed withdrawal notices)
CREATE POLICY "admin_insert_notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.is_lovable_admin());

-- Add uc_withdrawal_requests to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.uc_withdrawal_requests;
ALTER TABLE public.uc_withdrawal_requests REPLICA IDENTITY FULL;

-- RPC for admin to process withdrawal (approve / reject) and notify user
CREATE OR REPLACE FUNCTION public.process_uc_withdrawal(
  _id uuid,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.uc_withdrawal_requests;
  _new_status text;
  _title text;
  _body text;
BEGIN
  IF NOT public.is_lovable_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO _req FROM public.uc_withdrawal_requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'already_processed'; END IF;

  _new_status := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;

  UPDATE public.uc_withdrawal_requests
     SET status = _new_status,
         note = _note,
         processed_at = now()
   WHERE id = _id;

  IF _approve THEN
    _title := 'تم تنفيذ طلب سحب الشدات ✅';
    _body  := 'تم تحويل ' || _req.uc_amount || ' UC إلى معرّفك ' || _req.pubg_id || '.' ||
              COALESCE(E'\nملاحظة: ' || _note, '');
  ELSE
    _title := 'تم رفض طلب سحب الشدات ❌';
    _body  := 'تم إعادة ' || _req.trophies_cost || ' كأس إلى رصيدك.' ||
              COALESCE(E'\nالسبب: ' || _note, '');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    _req.user_id,
    'uc_withdrawal_' || _new_status,
    _title,
    _body,
    jsonb_build_object(
      'withdrawal_id', _req.id,
      'uc_amount', _req.uc_amount,
      'trophies_cost', _req.trophies_cost,
      'pubg_id', _req.pubg_id,
      'status', _new_status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_uc_withdrawal(uuid, boolean, text) TO authenticated;