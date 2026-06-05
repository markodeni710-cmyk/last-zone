CREATE OR REPLACE FUNCTION public.check_tournament_registration_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.tournaments;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id = NEW.tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.status IN ('live','finished','closed') THEN
    RAISE EXCEPTION 'registration_closed';
  END IF;
  IF t.starts_at IS NOT NULL AND t.starts_at <= now() THEN
    RAISE EXCEPTION 'registration_closed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_treg_open ON public.tournament_registrations;
CREATE TRIGGER check_treg_open
BEFORE INSERT ON public.tournament_registrations
FOR EACH ROW EXECUTE FUNCTION public.check_tournament_registration_open();