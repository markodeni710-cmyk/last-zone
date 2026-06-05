
ALTER TABLE public.clip_comments ADD CONSTRAINT clip_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.squad_applications ADD CONSTRAINT squad_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_registrations ADD CONSTRAINT tournament_registrations_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
