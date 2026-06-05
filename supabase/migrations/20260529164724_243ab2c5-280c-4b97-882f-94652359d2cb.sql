CREATE TABLE public.channel_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_reads TO authenticated;
GRANT ALL ON public.channel_reads TO service_role;

ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads_select_own" ON public.channel_reads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reads_insert_own" ON public.channel_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reads_update_own" ON public.channel_reads FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reads_delete_own" ON public.channel_reads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_channel_reads_user ON public.channel_reads(user_id);