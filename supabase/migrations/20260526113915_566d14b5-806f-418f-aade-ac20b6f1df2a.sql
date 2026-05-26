
CREATE TABLE IF NOT EXISTS public.meta_ignored_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  page_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  form_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ignored_forms_ws_form_unique
  ON public.meta_ignored_forms (workspace_id, form_id) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS meta_ignored_forms_owner_form_unique
  ON public.meta_ignored_forms (owner_id, form_id) WHERE workspace_id IS NULL;

ALTER TABLE public.meta_ignored_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or workspace member can view ignored forms"
  ON public.meta_ignored_forms FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "owner or workspace member can insert ignored forms"
  ON public.meta_ignored_forms FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "owner or workspace member can delete ignored forms"
  ON public.meta_ignored_forms FOR DELETE
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
