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
  IF NEW.workspace_id IS NOT NULL THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE workspace_id = NEW.workspace_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE owner_id = NEW.owner_id AND workspace_id IS NULL
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF s.is_enabled IS NOT TRUE THEN RETURN NEW; END IF;
  IF s.trigger_only_new_status AND NEW.status <> 'new' THEN RETURN NEW; END IF;
  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN RETURN NEW; END IF;

  INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, state)
  VALUES (NEW.id, NEW.owner_id, NEW.workspace_id, 'NEW')
  ON CONFLICT (lead_id) DO NOTHING;

  FOR step_row IN
    SELECT * FROM public.followup_sequence_steps
    WHERE is_enabled = true
      AND (
        (NEW.workspace_id IS NOT NULL AND workspace_id = NEW.workspace_id)
        OR (NEW.workspace_id IS NULL AND workspace_id IS NULL AND owner_id = NEW.owner_id)
      )
    ORDER BY step_order ASC
  LOOP
    step_interval := CASE step_row.delay_unit
      WHEN 'minutes' THEN (step_row.delay_value || ' minutes')::interval
      WHEN 'hours'   THEN (step_row.delay_value || ' hours')::interval
      WHEN 'days'    THEN (step_row.delay_value || ' days')::interval
      ELSE '0 minutes'::interval
    END;

    INSERT INTO public.lead_followup_tasks (lead_id, owner_id, workspace_id, task_type, status, scheduled_at, step_order)
    VALUES (NEW.id, NEW.owner_id, NEW.workspace_id, step_row.task_type, 'scheduled', now() + step_interval, step_row.step_order);
  END LOOP;

  RETURN NEW;
END;
$function$;