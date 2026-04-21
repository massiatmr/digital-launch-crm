
-- Allow platform admins to update any workspace
CREATE POLICY "Admins can update any workspace"
ON public.workspaces
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Promote the admin (member of HKSN) to owner so the workspace has an actual owner
UPDATE public.workspace_members
SET role = 'owner'
WHERE workspace_id = '4dc6a5ab-7395-4593-b088-294042cbc035'
  AND user_id = '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b';
