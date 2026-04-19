-- Nouveaux task types
ALTER TYPE public.followup_task_type ADD VALUE IF NOT EXISTS 'reactivation';
ALTER TYPE public.followup_task_type ADD VALUE IF NOT EXISTS 'manual_call';
ALTER TYPE public.followup_task_type ADD VALUE IF NOT EXISTS 'template_24h';

-- Nouveaux réglages
ALTER TABLE public.followup_automation_settings
  ADD COLUMN IF NOT EXISTS inactivity_threshold_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS enable_call_escalation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_24h_template_switch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_reactivation_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;