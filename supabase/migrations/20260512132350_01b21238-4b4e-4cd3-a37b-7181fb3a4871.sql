
CREATE TABLE public.workspace_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Landing page',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_workspace_api_keys_workspace ON public.workspace_api_keys(workspace_id);
CREATE INDEX idx_workspace_api_keys_hash ON public.workspace_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view workspace api keys"
ON public.workspace_api_keys FOR SELECT
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owners can insert workspace api keys"
ON public.workspace_api_keys FOR INSERT
WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owners can update workspace api keys"
ON public.workspace_api_keys FOR UPDATE
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owners can delete workspace api keys"
ON public.workspace_api_keys FOR DELETE
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
