-- Restrict workspace creation to admins only
DROP POLICY IF EXISTS "Authenticated can create workspaces" ON public.workspaces;

CREATE POLICY "Admins can create workspaces"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid());

-- Allow admin who just created a workspace to insert themselves as the owner member
DROP POLICY IF EXISTS "Admins can insert initial owner membership" ON public.workspace_members;

CREATE POLICY "Admins can insert initial owner membership"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_workspace_owner(workspace_id, auth.uid())
);