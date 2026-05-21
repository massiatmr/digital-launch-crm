-- Align whatsapp_messages UPDATE/DELETE policies with the workspace SELECT policy
DROP POLICY IF EXISTS "Owner can delete wa_messages" ON public.whatsapp_messages;

CREATE POLICY "Workspace can update whatsapp_messages"
ON public.whatsapp_messages
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

CREATE POLICY "Workspace can delete whatsapp_messages"
ON public.whatsapp_messages
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
