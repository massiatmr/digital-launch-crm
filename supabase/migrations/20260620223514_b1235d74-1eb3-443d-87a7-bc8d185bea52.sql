CREATE TABLE IF NOT EXISTS public.followup_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.lead_followup_tasks(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.followup_automation_events TO authenticated;
GRANT ALL ON public.followup_automation_events TO service_role;

ALTER TABLE public.followup_automation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspace followup events" ON public.followup_automation_events;
CREATE POLICY "Users can view workspace followup events"
ON public.followup_automation_events
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can create own followup events" ON public.followup_automation_events;
CREATE POLICY "Users can create own followup events"
ON public.followup_automation_events
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE INDEX IF NOT EXISTS idx_followup_events_lead_created ON public.followup_automation_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_events_workspace_created ON public.followup_automation_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_events_type_created ON public.followup_automation_events(event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_followup_automation_event(
  p_lead_id uuid,
  p_task_id uuid,
  p_owner_id uuid,
  p_workspace_id uuid,
  p_event_type text,
  p_level text,
  p_message text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.followup_automation_events (
    lead_id, task_id, owner_id, workspace_id, event_type, level, message, metadata
  ) VALUES (
    p_lead_id, p_task_id, p_owner_id, p_workspace_id, p_event_type, COALESCE(p_level, 'info'), p_message, COALESCE(p_metadata, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_followup_sequence_for_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.followup_automation_settings;
  step_row public.followup_sequence_steps;
  step_interval interval;
  use_offer_specific boolean := false;
  created_count integer := 0;
  matching_steps integer := 0;
  existing_auto_tasks integer := 0;
  existing_outbounds integer := 0;
  owner_fallback uuid;
  should_use_legacy boolean := false;
  legacy_initial_delay integer := 0;
  legacy_f1_delay integer := 24;
  legacy_f2_delay integer := 48;
  legacy_last_delay integer := 72;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_at < now() - interval '6 hours' THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_skip', 'info', 'Lead trop ancien pour créer une séquence automatique sur mise à jour', jsonb_build_object('created_at', NEW.created_at, 'operation', TG_OP));
    RETURN NEW;
  END IF;

  SELECT count(*) INTO existing_auto_tasks
  FROM public.lead_followup_tasks
  WHERE lead_id = NEW.id AND task_type <> 'manual_call';

  IF existing_auto_tasks > 0 THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_skip', 'info', 'Séquence déjà existante pour ce lead', jsonb_build_object('existing_auto_tasks', existing_auto_tasks));
    RETURN NEW;
  END IF;

  SELECT count(*) INTO existing_outbounds
  FROM public.whatsapp_messages
  WHERE lead_id = NEW.id AND direction = 'outbound' AND status IN ('sent', 'dry_run');

  IF existing_outbounds > 0 THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_skip', 'info', 'Message outbound déjà présent, pas de nouvelle séquence', jsonb_build_object('existing_outbounds', existing_outbounds));
    RETURN NEW;
  END IF;

  IF NEW.status IN ('lost', 'won') THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_skip', 'info', 'Lead déjà clôturé', jsonb_build_object('status', NEW.status));
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NOT NULL THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE workspace_id = NEW.workspace_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF s.id IS NULL THEN
    SELECT * INTO s FROM public.followup_automation_settings
    WHERE owner_id = NEW.owner_id AND workspace_id IS NULL
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF s.id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT wm.user_id INTO owner_fallback
    FROM public.workspace_members wm
    WHERE wm.workspace_id = NEW.workspace_id AND wm.role = 'owner'
    ORDER BY wm.created_at ASC
    LIMIT 1;

    IF owner_fallback IS NOT NULL THEN
      SELECT * INTO s FROM public.followup_automation_settings
      WHERE owner_id = owner_fallback AND workspace_id IS NULL
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  IF s.id IS NULL THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_blocked', 'warn', 'Aucun réglage d’automatisation trouvé', jsonb_build_object('source', NEW.source, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF s.is_enabled IS NOT TRUE THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_blocked', 'info', 'Automatisation désactivée dans les réglages', jsonb_build_object('settings_id', s.id));
    RETURN NEW;
  END IF;

  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_blocked', 'info', 'Source du lead non incluse dans les déclencheurs', jsonb_build_object('source', NEW.source, 'trigger_sources', s.trigger_sources));
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('new', 'contacted', 'qualified') THEN
    PERFORM public.log_followup_automation_event(NEW.id, NULL, NEW.owner_id, NEW.workspace_id, 'sequence_blocked', 'info', 'Statut non éligible à la création automatique', jsonb_build_object('status', NEW.status));
    RETURN NEW;
  END IF;

  INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, state)
  VALUES (NEW.id, NEW.owner_id, NEW.workspace_id, 'NEW')
  ON CONFLICT (lead_id) DO NOTHING;

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

  SELECT count(*) INTO matching_steps
  FROM public.followup_sequence_steps
  WHERE is_enabled = true
    AND (
      (NEW.workspace_id IS NOT NULL AND workspace_id = NEW.workspace_id)
      OR (NEW.workspace_id IS NULL AND workspace_id IS NULL AND owner_id = NEW.owner_id)
    )
    AND (
      (use_offer_specific AND offer_id = NEW.offer_id)
      OR (NOT use_offer_specific AND offer_id IS NULL)
    );

  should_use_legacy := matching_steps = 0;

  IF should_use_legacy THEN
    legacy_initial_delay := COALESCE(s.initial_delay_minutes, 0);
    legacy_f1_delay := COALESCE(s.followup_1_delay_hours, 24);
    legacy_f2_delay := COALESCE(s.followup_2_delay_hours, 48);
    legacy_last_delay := COALESCE(s.last_followup_delay_hours, 72);

    INSERT INTO public.lead_followup_tasks (lead_id, owner_id, workspace_id, task_type, status, scheduled_at, step_order)
    VALUES
      (NEW.id, NEW.owner_id, NEW.workspace_id, 'initial_message', 'scheduled', now() + (legacy_initial_delay || ' minutes')::interval, 1),
      (NEW.id, NEW.owner_id, NEW.workspace_id, 'followup_1', 'scheduled', now() + (legacy_f1_delay || ' hours')::interval, 2),
      (NEW.id, NEW.owner_id, NEW.workspace_id, 'followup_2', 'scheduled', now() + (legacy_f2_delay || ' hours')::interval, 3),
      (NEW.id, NEW.owner_id, NEW.workspace_id, 'last_followup', 'scheduled', now() + (legacy_last_delay || ' hours')::interval, 4);

    GET DIAGNOSTICS created_count = ROW_COUNT;
  ELSE
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
        WHEN 'hours' THEN (step_row.delay_value || ' hours')::interval
        WHEN 'days' THEN (step_row.delay_value || ' days')::interval
        ELSE '0 minutes'::interval
      END;

      INSERT INTO public.lead_followup_tasks (lead_id, owner_id, workspace_id, task_type, status, scheduled_at, step_order)
      VALUES (NEW.id, NEW.owner_id, NEW.workspace_id, step_row.task_type, 'scheduled', now() + step_interval, step_row.step_order);

      created_count := created_count + 1;
    END LOOP;
  END IF;

  PERFORM public.log_followup_automation_event(
    NEW.id,
    NULL,
    NEW.owner_id,
    NEW.workspace_id,
    CASE WHEN created_count > 0 THEN 'sequence_created' ELSE 'sequence_blocked' END,
    CASE WHEN created_count > 0 THEN 'info' ELSE 'warn' END,
    CASE WHEN created_count > 0 THEN 'Séquence automatique créée' ELSE 'Aucune tâche créée malgré des réglages actifs' END,
    jsonb_build_object('created_count', created_count, 'matching_steps', matching_steps, 'legacy_fallback', should_use_legacy, 'settings_id', s.id, 'operation', TG_OP)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_followup_sequence ON public.leads;
CREATE TRIGGER trg_create_followup_sequence
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.create_followup_sequence_for_lead();

DROP TRIGGER IF EXISTS trg_create_followup_sequence_on_recent_update ON public.leads;
CREATE TRIGGER trg_create_followup_sequence_on_recent_update
AFTER UPDATE OF status, source, workspace_id, owner_id, offer_id ON public.leads
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.source IS DISTINCT FROM NEW.source
  OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
  OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  OR OLD.offer_id IS DISTINCT FROM NEW.offer_id
)
EXECUTE FUNCTION public.create_followup_sequence_for_lead();