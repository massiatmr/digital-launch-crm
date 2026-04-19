-- Add notification_email to workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS notification_email text;

-- Drop existing unique constraints on followup_automation_settings (except PK)
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.followup_automation_settings'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.followup_automation_settings DROP CONSTRAINT %I', c_name);
  END LOOP;
END$$;

-- Unique per workspace (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS followup_automation_settings_workspace_uidx
  ON public.followup_automation_settings (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- Unique per owner when no workspace (legacy fallback)
CREATE UNIQUE INDEX IF NOT EXISTS followup_automation_settings_owner_legacy_uidx
  ON public.followup_automation_settings (owner_id)
  WHERE workspace_id IS NULL;

-- Update RLS to allow workspace members
DROP POLICY IF EXISTS "Owner can select settings" ON public.followup_automation_settings;
DROP POLICY IF EXISTS "Owner can insert settings" ON public.followup_automation_settings;
DROP POLICY IF EXISTS "Owner can update settings" ON public.followup_automation_settings;

CREATE POLICY "Workspace can select settings" ON public.followup_automation_settings
  FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Workspace can insert settings" ON public.followup_automation_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update settings" ON public.followup_automation_settings
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Same for sequence_steps & whatsapp_templates: allow workspace members to read/manage
DROP POLICY IF EXISTS "Owner can select sequence_steps" ON public.followup_sequence_steps;
DROP POLICY IF EXISTS "Owner can insert sequence_steps" ON public.followup_sequence_steps;
DROP POLICY IF EXISTS "Owner can update sequence_steps" ON public.followup_sequence_steps;
DROP POLICY IF EXISTS "Owner can delete sequence_steps" ON public.followup_sequence_steps;

CREATE POLICY "Workspace can select sequence_steps" ON public.followup_sequence_steps
  FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Workspace can insert sequence_steps" ON public.followup_sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update sequence_steps" ON public.followup_sequence_steps
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Workspace can delete sequence_steps" ON public.followup_sequence_steps
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );