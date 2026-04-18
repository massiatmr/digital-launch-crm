-- 1. Table whatsapp_templates : stocke les templates Meta approuvés (synchronisés ou créés manuellement)
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  category TEXT NOT NULL DEFAULT 'MARKETING',
  body_text TEXT NOT NULL DEFAULT '',
  variables_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  is_synced BOOLEAN NOT NULL DEFAULT false,
  meta_template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, name, language)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select wa templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert wa templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update wa templates" ON public.whatsapp_templates
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete wa templates" ON public.whatsapp_templates
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER update_wa_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Ajouter dry_run + mappings template par type de tâche dans followup_automation_settings
ALTER TABLE public.followup_automation_settings
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_initial_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_followup_1_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_followup_2_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_last_followup_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;