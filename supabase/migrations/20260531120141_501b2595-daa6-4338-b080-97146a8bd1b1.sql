
-- Fix "tuple to be deleted was already modified" on server delete.
-- The BEFORE DELETE cleanup trigger deletes server_members which in turn
-- fires handle_server_member_change() trying to UPDATE the dying server row.
CREATE OR REPLACE FUNCTION public.handle_server_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.servers SET member_count = member_count + 1 WHERE id = NEW.server_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip the count update if the server itself is gone or being deleted.
    UPDATE public.servers
       SET member_count = GREATEST(member_count - 1, 0)
     WHERE id = OLD.server_id
       AND EXISTS (SELECT 1 FROM public.servers WHERE id = OLD.server_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Re-add public read on avatars bucket. Avatars are intentionally public
-- (used via getPublicUrl). Without a SELECT policy, upsert/update flows fail
-- with "new row violates row-level security policy".
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
