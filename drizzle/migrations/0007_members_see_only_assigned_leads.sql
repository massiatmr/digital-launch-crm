DROP POLICY "Workspace can select leads" ON public.leads;
DROP POLICY "Workspace can update leads" ON public.leads;
CREATE POLICY "Workspace can select leads" ON public.leads FOR SELECT TO authenticated USING (
  deleted_at IS NULL AND (
    (owner_id = auth.uid() AND workspace_id IS NULL)
    OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()) AND (assigned_to = auth.uid() OR owner_id = auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Workspace can update leads" ON public.leads FOR UPDATE TO authenticated USING (
    (owner_id = auth.uid() AND workspace_id IS NULL)
    OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()) AND (assigned_to = auth.uid() OR owner_id = auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role));