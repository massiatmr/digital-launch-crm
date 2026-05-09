ALTER TABLE public.followup_automation_settings DROP CONSTRAINT followup_automation_settings_pkey;
ALTER TABLE public.followup_automation_settings ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.followup_automation_settings ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS followup_automation_settings_workspace_unique ON public.followup_automation_settings(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS followup_automation_settings_owner_solo_unique ON public.followup_automation_settings(owner_id) WHERE workspace_id IS NULL;