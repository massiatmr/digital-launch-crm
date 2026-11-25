ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS vsl_link text;
CREATE POLICY "Workspace can select own deleted offers" ON public.offers FOR SELECT TO authenticated
USING ((owner_id = auth.uid()) OR ((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));