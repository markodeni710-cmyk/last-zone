
-- Direct calls between friends (1:1 voice)
CREATE TABLE public.dm_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ringing', -- ringing | accepted | declined | ended | missed | canceled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds')
);

CREATE INDEX dm_calls_callee_status_idx ON public.dm_calls(callee_id, status);
CREATE INDEX dm_calls_caller_status_idx ON public.dm_calls(caller_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_calls TO authenticated;
GRANT ALL ON public.dm_calls TO service_role;

ALTER TABLE public.dm_calls ENABLE ROW LEVEL SECURITY;

-- Only friends can be called; enforced via insert policy using friendships
CREATE POLICY dm_calls_insert_caller_friends
ON public.dm_calls FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = caller_id
  AND caller_id <> callee_id
  AND EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = caller_id AND f.addressee_id = callee_id)
        OR (f.requester_id = callee_id AND f.addressee_id = caller_id)
      )
  )
  AND NOT public.is_blocked_between(caller_id, callee_id)
);

CREATE POLICY dm_calls_select_involved
ON public.dm_calls FOR SELECT TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY dm_calls_update_involved
ON public.dm_calls FOR UPDATE TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY dm_calls_delete_involved
ON public.dm_calls FOR DELETE TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;
