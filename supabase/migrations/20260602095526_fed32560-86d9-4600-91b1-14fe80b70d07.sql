
-- Helper to check if a user_id belongs to the official site admin (username = 'moniromran')
CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND lower(username) = 'moniromran'
  )
$$;

-- Block any attempt by a non-admin to BLOCK the site admin
CREATE OR REPLACE FUNCTION public.protect_admin_from_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_user(NEW.blocked_id) AND NOT public.is_admin_user(NEW.blocker_id) THEN
    RAISE EXCEPTION 'لا يمكن حظر حساب الإدارة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_from_block ON public.user_blocks;
CREATE TRIGGER trg_protect_admin_from_block
BEFORE INSERT ON public.user_blocks
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_from_block();

-- Block any attempt by a non-admin to send a FRIEND REQUEST to the admin
CREATE OR REPLACE FUNCTION public.protect_admin_from_friend_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_user(NEW.addressee_id) AND NOT public.is_admin_user(NEW.requester_id) THEN
    RAISE EXCEPTION 'لا يمكن إرسال طلب صداقة لحساب الإدارة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_from_friend_request ON public.friendships;
CREATE TRIGGER trg_protect_admin_from_friend_request
BEFORE INSERT ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_from_friend_request();

-- Block any attempt by a non-admin to open a DM thread with the admin
CREATE OR REPLACE FUNCTION public.protect_admin_from_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other_id uuid;
BEGIN
  other_id := CASE WHEN NEW.initiator_id = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END;
  IF public.is_admin_user(other_id) AND NOT public.is_admin_user(NEW.initiator_id) THEN
    RAISE EXCEPTION 'لا يمكن مراسلة حساب الإدارة، الإدارة هي من تبدأ المحادثة' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_from_dm ON public.dm_threads;
CREATE TRIGGER trg_protect_admin_from_dm
BEFORE INSERT ON public.dm_threads
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_from_dm();
