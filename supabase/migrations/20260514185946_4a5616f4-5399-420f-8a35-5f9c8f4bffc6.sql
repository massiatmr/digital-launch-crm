
-- 1) workspace_id devient obligatoire
ALTER TABLE public.whatsapp_config
  ALTER COLUMN workspace_id SET NOT NULL;

-- 2) Unicité : une seule config WhatsApp par workspace
DROP INDEX IF EXISTS public.whatsapp_config_workspace_unique;
CREATE UNIQUE INDEX whatsapp_config_workspace_unique
  ON public.whatsapp_config (workspace_id);

-- Index utile pour le routage du webhook par phone_number_id
CREATE INDEX IF NOT EXISTS whatsapp_config_phone_number_id_idx
  ON public.whatsapp_config (phone_number_id);

-- 3) Refonte RLS : accès basé sur l'appartenance au workspace (plus owner_id solo)
DROP POLICY IF EXISTS "Owner can insert own wa config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Owner can update own wa config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Owner can delete own wa config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Workspace can select wa config" ON public.whatsapp_config;

-- SELECT : tout membre du workspace (ou admin global)
CREATE POLICY "wa_config_select_workspace_member"
ON public.whatsapp_config FOR SELECT
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- INSERT : seul l'owner du workspace (ou admin)
CREATE POLICY "wa_config_insert_workspace_owner"
ON public.whatsapp_config FOR INSERT
WITH CHECK (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- UPDATE : owner du workspace
CREATE POLICY "wa_config_update_workspace_owner"
ON public.whatsapp_config FOR UPDATE
USING (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- DELETE : owner du workspace
CREATE POLICY "wa_config_delete_workspace_owner"
ON public.whatsapp_config FOR DELETE
USING (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
