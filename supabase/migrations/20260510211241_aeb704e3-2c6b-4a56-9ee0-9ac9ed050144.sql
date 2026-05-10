
ALTER TABLE public.followup_sequence_steps ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fss_owner_offer_step ON public.followup_sequence_steps(owner_id, offer_id, step_order);

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
  use_offer_specific BOOLEAN := false;
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE workspace_id = NEW.workspace_id LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE owner_id = NEW.owner_id AND workspace_id IS NULL LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF s.is_enabled IS NOT TRUE THEN RETURN NEW; END IF;
  IF s.trigger_only_new_status AND NEW.status <> 'new' THEN RETURN NEW; END IF;
  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN RETURN NEW; END IF;

  INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, state)
  VALUES (NEW.id, NEW.owner_id, NEW.workspace_id, 'NEW')
  ON CONFLICT (lead_id) DO NOTHING;

  -- Check if offer-specific sequence exists for this lead's offer
  IF NEW.offer_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.followup_sequence_steps
      WHERE is_enabled = true
        AND offer_id = NEW.offer_id
        AND (
          (NEW.workspace_id IS NOT NULL AND workspace_id = NEW.workspace_id)
          OR (NEW.workspace_id IS NULL AND workspace_id IS NULL AND owner_id = NEW.owner_id)
        )
    ) INTO use_offer_specific;
  END IF;

  FOR step_row IN
    SELECT * FROM public.followup_sequence_steps
    WHERE is_enabled = true
      AND (
        (NEW.workspace_id IS NOT NULL AND workspace_id = NEW.workspace_id)
        OR (NEW.workspace_id IS NULL AND workspace_id IS NULL AND owner_id = NEW.owner_id)
      )
      AND (
        (use_offer_specific AND offer_id = NEW.offer_id)
        OR (NOT use_offer_specific AND offer_id IS NULL)
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
