
-- Table de mapping form → offre
CREATE TABLE public.meta_form_offer_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  workspace_id UUID,
  page_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL DEFAULT '',
  offer_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, form_id)
);

ALTER TABLE public.meta_form_offer_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select form_offer_mapping"
ON public.meta_form_offer_mapping FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace can insert form_offer_mapping"
ON public.meta_form_offer_mapping FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND (workspace_id IS NULL OR is_workspace_member(workspace_id, auth.uid()))
);

CREATE POLICY "Workspace can update form_offer_mapping"
ON public.meta_form_offer_mapping FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace can delete form_offer_mapping"
ON public.meta_form_offer_mapping FOR DELETE TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER trg_meta_form_offer_mapping_updated_at
BEFORE UPDATE ON public.meta_form_offer_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_meta_form_offer_mapping_form_id ON public.meta_form_offer_mapping(form_id);
CREATE INDEX idx_meta_form_offer_mapping_workspace ON public.meta_form_offer_mapping(workspace_id);

-- Token validity flag
ALTER TABLE public.meta_pages
ADD COLUMN IF NOT EXISTS token_valid BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS token_invalidated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_token_notified_at TIMESTAMP WITH TIME ZONE;
