
CREATE POLICY "dm_threads_delete_involved" ON public.dm_threads
FOR DELETE TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "dm_delete_involved" ON public.direct_messages
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dm_threads t
  WHERE t.id = direct_messages.thread_id
    AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
));
