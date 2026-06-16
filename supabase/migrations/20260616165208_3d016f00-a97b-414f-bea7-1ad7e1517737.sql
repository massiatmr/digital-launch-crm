
ALTER TABLE public.user_workspace_notification_prefs
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT true;

-- Owner-managed policies (en plus des policies "own prefs" existantes)
DROP POLICY IF EXISTS "Workspace owners can read members prefs" ON public.user_workspace_notification_prefs;
CREATE POLICY "Workspace owners can read members prefs"
  ON public.user_workspace_notification_prefs
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace owners can insert members prefs" ON public.user_workspace_notification_prefs;
CREATE POLICY "Workspace owners can insert members prefs"
  ON public.user_workspace_notification_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_owner(workspace_id, auth.uid())
    AND public.is_workspace_member(workspace_id, user_id)
  );

DROP POLICY IF EXISTS "Workspace owners can update members prefs" ON public.user_workspace_notification_prefs;
CREATE POLICY "Workspace owners can update members prefs"
  ON public.user_workspace_notification_prefs
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace owners can delete members prefs" ON public.user_workspace_notification_prefs;
CREATE POLICY "Workspace owners can delete members prefs"
  ON public.user_workspace_notification_prefs
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()));
