
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS workspace_role public.workspace_role NOT NULL DEFAULT 'member';

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON public.invitations(workspace_id);

-- Allow workspace owners to manage invitations targeted at their workspace
DROP POLICY IF EXISTS "Workspace owners manage their invitations" ON public.invitations;
CREATE POLICY "Workspace owners manage their invitations"
ON public.invitations
FOR ALL
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND public.is_workspace_owner(workspace_id, auth.uid())
)
WITH CHECK (
  workspace_id IS NOT NULL
  AND public.is_workspace_owner(workspace_id, auth.uid())
);

-- Function consumed at signup: add membership + mark used
CREATE OR REPLACE FUNCTION public.consume_workspace_invitation(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = p_token;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;

  UPDATE public.invitations SET used_at = now(), used_by = p_user_id WHERE id = inv.id;

  -- Always grant the basic 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'user')
  ON CONFLICT DO NOTHING;

  -- If invite targets a workspace, add membership
  IF inv.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, p_user_id, inv.workspace_role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', inv.workspace_id,
    'workspace_role', inv.workspace_role
  );
END;
$$;

-- Unique constraint to enable ON CONFLICT above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_user_unique'
  ) THEN
    ALTER TABLE public.workspace_members
      ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id);
  END IF;
END$$;
