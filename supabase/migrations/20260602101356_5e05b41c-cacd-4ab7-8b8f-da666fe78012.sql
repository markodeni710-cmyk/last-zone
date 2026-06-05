CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread(_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := auth.uid();
  a UUID; b UUID;
  tid UUID;
  are_friends BOOLEAN;
  admin_initiator BOOLEAN;
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

  -- Site admin can force-open any conversation without recipient acceptance
  admin_initiator := public.is_admin_user(me);

  IF tid IS NULL THEN
    INSERT INTO public.dm_threads(user_a, user_b, accepted, initiator_id)
      VALUES (a, b, are_friends OR admin_initiator, me)
      RETURNING id INTO tid;
  ELSIF are_friends OR admin_initiator THEN
    UPDATE public.dm_threads SET accepted = true WHERE id = tid AND accepted = false;
  END IF;
  RETURN tid;
END $function$;

-- Allow admin to bypass the "must accept first" insert check on direct_messages
CREATE OR REPLACE FUNCTION public.dm_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.dm_threads;
BEGIN
  SELECT * INTO t FROM public.dm_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF NOT t.accepted THEN
    -- Site admin can always send regardless of acceptance state
    IF public.is_admin_user(NEW.sender_id) THEN
      UPDATE public.dm_threads SET accepted = true WHERE id = NEW.thread_id;
      RETURN NEW;
    END IF;
    IF NEW.sender_id <> t.initiator_id THEN
      RAISE EXCEPTION 'recipient must accept the message request first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.direct_messages WHERE thread_id = NEW.thread_id) THEN
      RAISE EXCEPTION 'cannot send more messages until request is accepted';
    END IF;
  END IF;
  RETURN NEW;
END $function$;