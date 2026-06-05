
-- Allow admin to call anyone; keep blocking non-admin → admin
CREATE OR REPLACE FUNCTION public.block_admin_voice_calls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin_user(NEW.callee_id) AND NOT public.is_admin_user(NEW.caller_id) THEN
    RAISE EXCEPTION 'لا يمكن إجراء مكالمة مع حساب الإدارة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Replace RLS policy: admin can insert any call; others need friendship + no block
DROP POLICY IF EXISTS dm_calls_insert_caller_friends ON public.dm_calls;
CREATE POLICY dm_calls_insert_caller_friends ON public.dm_calls
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = caller_id
  AND caller_id <> callee_id
  AND (
    public.is_admin_user(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = dm_calls.caller_id AND f.addressee_id = dm_calls.callee_id)
            OR (f.requester_id = dm_calls.callee_id AND f.addressee_id = dm_calls.caller_id))
      )
      AND NOT public.is_blocked_between(caller_id, callee_id)
    )
  )
);
