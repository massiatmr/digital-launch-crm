-- Ajouter colonne pour configurer les sources qui déclenchent l'auto-séquence
ALTER TABLE public.followup_automation_settings
ADD COLUMN IF NOT EXISTS trigger_sources lead_source[] NOT NULL DEFAULT ARRAY['facebook']::lead_source[];

ALTER TABLE public.followup_automation_settings
ADD COLUMN IF NOT EXISTS trigger_only_new_status boolean NOT NULL DEFAULT true;

-- Recréer la fonction trigger avec conditions sur status + source
CREATE OR REPLACE FUNCTION public.create_followup_sequence_for_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.followup_automation_settings;
BEGIN
  -- Charger settings du owner (créer ligne par défaut si absente)
  SELECT * INTO s FROM public.followup_automation_settings WHERE owner_id = NEW.owner_id;
  IF NOT FOUND THEN
    INSERT INTO public.followup_automation_settings (owner_id) VALUES (NEW.owner_id)
    RETURNING * INTO s;
  END IF;

  -- Automation désactivée → on ne fait rien
  IF s.is_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Filtre statut : seulement les leads "new" si l'option est active
  IF s.trigger_only_new_status AND NEW.status <> 'new' THEN
    RETURN NEW;
  END IF;

  -- Filtre source : seulement les sources configurées
  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN
    RETURN NEW;
  END IF;

  -- État conversation initial
  INSERT INTO public.lead_conversation_state (lead_id, owner_id, state)
  VALUES (NEW.id, NEW.owner_id, 'NEW')
  ON CONFLICT (lead_id) DO NOTHING;

  -- 1. Message initial
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'initial_message', 'scheduled',
          now() + (s.initial_delay_minutes || ' minutes')::interval, 1);

  -- 2. Relance 1
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'followup_1', 'scheduled',
          now() + (s.followup_1_delay_hours || ' hours')::interval, 2);

  -- 3. Relance 2
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'followup_2', 'scheduled',
          now() + (s.followup_2_delay_hours || ' hours')::interval, 3);

  -- 4. Dernière relance
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'last_followup', 'scheduled',
          now() + (s.last_followup_delay_hours || ' hours')::interval, 4);

  -- 5 & 6 placeholders
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'qualification', 'pending', now() + interval '100 years', 5);

  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'propose_meeting', 'pending', now() + interval '100 years', 6);

  RETURN NEW;
END;
$function$;

-- S'assurer que le trigger existe (AFTER INSERT sur leads)
DROP TRIGGER IF EXISTS trg_create_followup_sequence ON public.leads;
CREATE TRIGGER trg_create_followup_sequence
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.create_followup_sequence_for_lead();