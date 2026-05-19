
-- 1. Restrict meta_pages SELECT to workspace owners
DROP POLICY IF EXISTS "Workspace can select meta_pages" ON public.meta_pages;
CREATE POLICY "Owners can select meta_pages"
ON public.meta_pages
FOR SELECT
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Restrict meta_channel_identities SELECT to workspace owners
DROP POLICY IF EXISTS "Workspace can select meta_channel_identities" ON public.meta_channel_identities;
CREATE POLICY "Owners can select meta_channel_identities"
ON public.meta_channel_identities
FOR SELECT
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Restrict whatsapp_config SELECT to workspace owners
DROP POLICY IF EXISTS "wa_config_select_workspace_member" ON public.whatsapp_config;
CREATE POLICY "wa_config_select_workspace_owner"
ON public.whatsapp_config
FOR SELECT
USING (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Realtime channel authorization: require authenticated users
-- Drop any existing permissive policy and add a baseline auth check
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_can_receive" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "authenticated_can_receive"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (auth.uid() IS NOT NULL)$p$;
  END IF;
END $$;
