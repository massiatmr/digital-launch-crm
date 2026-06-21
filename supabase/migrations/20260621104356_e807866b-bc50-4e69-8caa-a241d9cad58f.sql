
-- 1) Realtime Broadcast/Presence : verrouille realtime.messages aux membres workspace.
-- L'app n'utilise pas Broadcast. On bloque toute lecture/écriture côté authenticated.
-- (postgres_changes continue de fonctionner via RLS sur les tables source.)
DO $$ BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "deny_authenticated_broadcast_read" ON realtime.messages;
DROP POLICY IF EXISTS "deny_authenticated_broadcast_write" ON realtime.messages;

CREATE POLICY "deny_authenticated_broadcast_read"
ON realtime.messages FOR SELECT
TO authenticated
USING (false);

CREATE POLICY "deny_authenticated_broadcast_write"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2) Workspace member SELECT pour client_activities
DROP POLICY IF EXISTS "client_activities_select" ON public.client_activities;
CREATE POLICY "client_activities_select"
ON public.client_activities FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3) Workspace member SELECT pour client_resources
DROP POLICY IF EXISTS "client_resources_select" ON public.client_resources;
CREATE POLICY "client_resources_select"
ON public.client_resources FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4) Workspace member SELECT pour lead_activities
DROP POLICY IF EXISTS "lead_activities_select" ON public.lead_activities;
CREATE POLICY "lead_activities_select"
ON public.lead_activities FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
