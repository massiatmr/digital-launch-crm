-- Fix RLS UPDATE policy on offers to add explicit WITH CHECK and allow workspace owners
DROP POLICY IF EXISTS "Workspace can update offers" ON public.offers;

CREATE POLICY "Workspace can update offers"
ON public.offers
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);