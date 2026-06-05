
-- 1) Helper: get admin user id
CREATE OR REPLACE FUNCTION public.get_admin_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(username) = 'moniromran' LIMIT 1;
$$;

-- 2) Ensure admin friendship for a given user (accepted both ways via single row)
CREATE OR REPLACE FUNCTION public.ensure_admin_friendship(_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _admin uuid := public.get_admin_user_id();
BEGIN
  IF _admin IS NULL OR _user IS NULL OR _user = _admin THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((requester_id = _admin AND addressee_id = _user)
        OR (requester_id = _user AND addressee_id = _admin))
  ) THEN
    UPDATE public.friendships
       SET status = 'accepted'
     WHERE ((requester_id = _admin AND addressee_id = _user)
         OR (requester_id = _user AND addressee_id = _admin))
       AND status <> 'accepted';
    RETURN;
  END IF;
  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (_admin, _user, 'accepted');
END;
$$;

-- 3) Trigger on new profile to add admin as friend
CREATE OR REPLACE FUNCTION public.profile_ensure_admin_friend()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_admin_friendship(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_ensure_admin_friend ON public.profiles;
CREATE TRIGGER trg_profile_ensure_admin_friend
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profile_ensure_admin_friend();

-- 4) Backfill for all existing non-admin users
DO $$
DECLARE
  _admin uuid := public.get_admin_user_id();
BEGIN
  IF _admin IS NULL THEN RETURN; END IF;
  INSERT INTO public.friendships (requester_id, addressee_id, status)
  SELECT _admin, p.id, 'accepted'
  FROM public.profiles p
  WHERE p.id <> _admin
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.requester_id = _admin AND f.addressee_id = p.id)
         OR (f.requester_id = p.id AND f.addressee_id = _admin)
    );
  UPDATE public.friendships SET status = 'accepted'
   WHERE (requester_id = _admin OR addressee_id = _admin)
     AND status <> 'accepted';
END $$;

-- 5) Prevent non-admin from deleting friendship with admin
CREATE OR REPLACE FUNCTION public.protect_admin_friendship_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (public.is_admin_user(OLD.requester_id) OR public.is_admin_user(OLD.addressee_id))
     AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'لا يمكن إزالة حساب الإدارة من قائمة الأصدقاء' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_friendship_delete ON public.friendships;
CREATE TRIGGER trg_protect_admin_friendship_delete
BEFORE DELETE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_friendship_delete();

-- 6) Prevent non-admin from deleting DM thread with admin
CREATE OR REPLACE FUNCTION public.protect_admin_dm_thread_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (public.is_admin_user(OLD.user_a) OR public.is_admin_user(OLD.user_b))
     AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'لا يمكن حذف محادثة حساب الإدارة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_dm_thread_delete ON public.dm_threads;
CREATE TRIGGER trg_protect_admin_dm_thread_delete
BEFORE DELETE ON public.dm_threads
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_dm_thread_delete();

-- 7) Prevent voice calls to/from admin (admin = text-only contact)
CREATE OR REPLACE FUNCTION public.block_admin_voice_calls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin_user(NEW.caller_id) OR public.is_admin_user(NEW.callee_id) THEN
    RAISE EXCEPTION 'لا يمكن إجراء مكالمة مع حساب الإدارة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_admin_voice_calls ON public.dm_calls;
CREATE TRIGGER trg_block_admin_voice_calls
BEFORE INSERT ON public.dm_calls
FOR EACH ROW EXECUTE FUNCTION public.block_admin_voice_calls();
