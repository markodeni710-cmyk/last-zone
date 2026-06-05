-- Server-side enforcement of reserved usernames (admin-impersonation guard)
CREATE OR REPLACE FUNCTION public.validate_username_reserved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u text;
  _patterns text[] := ARRAY[
    'admin','administrator','adm1n','admın',
    'mod','moderator','owner','founder',
    'support','helpdesk','staff','team',
    'official','verified','root','system',
    'lovable','lastzone','last_zone','last-zone',
    'ceo','manager','boss',
    'اداره','إداره','ادارة','إدارة','مدير','ادمن','أدمن','مشرف','دعم','الدعم'
  ];
  p text;
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  _u := lower(trim(NEW.username));

  -- Allow the actual admin handle to remain
  IF _u = 'moniromran' THEN
    RETURN NEW;
  END IF;

  FOREACH p IN ARRAY _patterns LOOP
    IF position(p IN _u) > 0 THEN
      RAISE EXCEPTION 'reserved_username: this username is reserved and cannot be used'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_username_reserved ON public.profiles;
CREATE TRIGGER trg_validate_username_reserved
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_username_reserved();