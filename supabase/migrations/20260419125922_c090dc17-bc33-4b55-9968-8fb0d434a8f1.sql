
-- Table des étapes dynamiques de la séquence de relance par owner
CREATE TABLE public.followup_sequence_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  step_order INTEGER NOT NULL,
  task_type public.followup_task_type NOT NULL DEFAULT 'followup_1',
  delay_value INTEGER NOT NULL DEFAULT 0,
  delay_unit TEXT NOT NULL DEFAULT 'minutes' CHECK (delay_unit IN ('minutes','hours','days')),
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_sequence_steps_owner ON public.followup_sequence_steps(owner_id, step_order);

ALTER TABLE public.followup_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select sequence_steps" ON public.followup_sequence_steps
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert sequence_steps" ON public.followup_sequence_steps
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update sequence_steps" ON public.followup_sequence_steps
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete sequence_steps" ON public.followup_sequence_steps
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER set_updated_at_followup_sequence_steps
  BEFORE UPDATE ON public.followup_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrer les 4 étapes actuelles de chaque owner depuis followup_automation_settings
INSERT INTO public.followup_sequence_steps (owner_id, step_order, task_type, delay_value, delay_unit, template_id, label, is_enabled)
SELECT s.owner_id, 1, 'initial_message'::public.followup_task_type,
       COALESCE(s.initial_delay_minutes, 0), 'minutes',
       s.template_initial_id, 'Message initial', true
FROM public.followup_automation_settings s
UNION ALL
SELECT s.owner_id, 2, 'followup_1'::public.followup_task_type,
       COALESCE(s.followup_1_delay_hours, 24), 'hours',
       s.template_followup_1_id, 'Relance 1', true
FROM public.followup_automation_settings s
UNION ALL
SELECT s.owner_id, 3, 'followup_2'::public.followup_task_type,
       COALESCE(s.followup_2_delay_hours, 48), 'hours',
       s.template_followup_2_id, 'Relance 2', true
FROM public.followup_automation_settings s
UNION ALL
SELECT s.owner_id, 4, 'last_followup'::public.followup_task_type,
       COALESCE(s.last_followup_delay_hours, 72), 'hours',
       s.template_last_followup_id, 'Dernière relance', true
FROM public.followup_automation_settings s;

-- Refactor du trigger pour utiliser la séquence dynamique
CREATE OR REPLACE FUNCTION public.create_followup_sequence_for_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.followup_automation_settings;
  step_row public.followup_sequence_steps;
  step_interval INTERVAL;
BEGIN
  SELECT * INTO s FROM public.followup_automation_settings WHERE owner_id = NEW.owner_id;
  IF NOT FOUND THEN
    INSERT INTO public.followup_automation_settings (owner_id) VALUES (NEW.owner_id)
    RETURNING * INTO s;
  END IF;

  IF s.is_enabled IS NOT TRUE THEN RETURN NEW; END IF;
  IF s.trigger_only_new_status AND NEW.status <> 'new' THEN RETURN NEW; END IF;
  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN RETURN NEW; END IF;

  INSERT INTO public.lead_conversation_state (lead_id, owner_id, state)
  VALUES (NEW.id, NEW.owner_id, 'NEW')
  ON CONFLICT (lead_id) DO NOTHING;

  -- Itère la séquence dynamique de l'owner
  FOR step_row IN
    SELECT * FROM public.followup_sequence_steps
    WHERE owner_id = NEW.owner_id AND is_enabled = true
    ORDER BY step_order ASC
  LOOP
    step_interval := CASE step_row.delay_unit
      WHEN 'minutes' THEN (step_row.delay_value || ' minutes')::interval
      WHEN 'hours'   THEN (step_row.delay_value || ' hours')::interval
      WHEN 'days'    THEN (step_row.delay_value || ' days')::interval
      ELSE '0 minutes'::interval
    END;

    INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
    VALUES (NEW.id, NEW.owner_id, step_row.task_type, 'scheduled', now() + step_interval, step_row.step_order);
  END LOOP;

  RETURN NEW;
END;
$function$;
