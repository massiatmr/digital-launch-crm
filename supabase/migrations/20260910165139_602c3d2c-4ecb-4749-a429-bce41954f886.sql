CREATE POLICY "smtp settings no direct access" ON public.workspace_smtp_settings
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false);