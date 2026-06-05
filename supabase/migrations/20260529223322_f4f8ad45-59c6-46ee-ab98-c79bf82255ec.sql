
-- Friendships table
CREATE TABLE public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  addressee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending','accepted')),
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
);

-- Unique on unordered pair
CREATE UNIQUE INDEX friendships_pair_uniq ON public.friendships (
  LEAST(requester_id, addressee_id),
  GREATEST(requester_id, addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY friendships_select_involved ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY friendships_insert_requester ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

CREATE POLICY friendships_update_addressee ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id);

CREATE POLICY friendships_delete_involved ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- DM threads
CREATE TABLE public.dm_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  initiator_id UUID NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_pair_order CHECK (user_a < user_b)
);
CREATE UNIQUE INDEX dm_threads_pair_uniq ON public.dm_threads (user_a, user_b);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY dm_threads_select_involved ON public.dm_threads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY dm_threads_insert_involved ON public.dm_threads
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_a OR auth.uid() = user_b) AND auth.uid() = initiator_id);

CREATE POLICY dm_threads_update_other ON public.dm_threads
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Direct messages
CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX direct_messages_thread_idx ON public.direct_messages(thread_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY dm_select_involved ON public.direct_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
  ));

CREATE POLICY dm_insert_sender ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
    )
  );

CREATE POLICY dm_update_recipient ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
  ));

-- Trigger: enforce "single message before accept" + update thread last_message_at
CREATE OR REPLACE FUNCTION public.dm_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.dm_threads;
BEGIN
  SELECT * INTO t FROM public.dm_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF NOT t.accepted THEN
    -- only initiator can send, and only one message until accepted
    IF NEW.sender_id <> t.initiator_id THEN
      RAISE EXCEPTION 'recipient must accept the message request first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.direct_messages WHERE thread_id = NEW.thread_id) THEN
      RAISE EXCEPTION 'cannot send more messages until request is accepted';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER dm_before_insert_trg
BEFORE INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.dm_before_insert();

CREATE OR REPLACE FUNCTION public.dm_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dm_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;

CREATE TRIGGER dm_after_insert_trg
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.dm_after_insert();

-- Auto accept thread when both users are friends (helper function used client side)
CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread(_other UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  a UUID; b UUID;
  tid UUID;
  are_friends BOOLEAN;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF me = _other THEN RAISE EXCEPTION 'cannot DM self'; END IF;
  a := LEAST(me, _other);
  b := GREATEST(me, _other);
  SELECT id INTO tid FROM public.dm_threads WHERE user_a = a AND user_b = b;
  SELECT EXISTS(SELECT 1 FROM public.friendships
    WHERE status='accepted'
      AND ((requester_id = me AND addressee_id = _other)
        OR (requester_id = _other AND addressee_id = me))) INTO are_friends;
  IF tid IS NULL THEN
    INSERT INTO public.dm_threads(user_a, user_b, accepted, initiator_id)
      VALUES (a, b, are_friends, me)
      RETURNING id INTO tid;
  ELSIF are_friends THEN
    UPDATE public.dm_threads SET accepted = true WHERE id = tid AND accepted = false;
  END IF;
  RETURN tid;
END $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_dm_thread(UUID) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
