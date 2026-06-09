
-- Restrict SELECT on sensitive credential tables to workspace owners only
DROP POLICY IF EXISTS "members can view workspace calendar accounts" ON public.calendar_accounts;
CREATE POLICY "owners can view calendar accounts"
ON public.calendar_accounts FOR SELECT TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Workspace members can read google_tokens" ON public.google_tokens;
CREATE POLICY "Workspace owners can read google_tokens"
ON public.google_tokens FOR SELECT TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "members can view meta capi config" ON public.meta_capi_configs;
CREATE POLICY "owners can view meta capi config"
ON public.meta_capi_configs FOR SELECT TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Tighten UPDATE on meta_channel_identities to workspace owners only
DROP POLICY IF EXISTS "Workspace can update meta_channel_identities" ON public.meta_channel_identities;
CREATE POLICY "Owners can update meta_channel_identities"
ON public.meta_channel_identities FOR UPDATE TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Fix mutable search_path on update_updated_at_column (already set, but ensure consistency)
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
