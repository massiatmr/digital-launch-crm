
CREATE POLICY "Owner can update activities"
ON public.client_activities
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owner can delete activities"
ON public.client_activities
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owner can update resources"
ON public.client_resources
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
