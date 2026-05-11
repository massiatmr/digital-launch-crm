-- 1) Fix trigger: ne plus exclure les leads non-'new' (les leads Facebook arrivent souvent en 'contacted')
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
  -- On accepte 'new' ET 'contacted' (le webhook FB peut créer en 'contacted')
  IF NEW.status NOT IN ('new', 'contacted') THEN RETURN NEW; END IF;
  IF NOT (NEW.source = ANY(s.trigger_sources)) THEN RETURN NEW; END IF;

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

-- 2) RPC de diagnostic IA par lead (essentiel)
CREATE OR REPLACE FUNCTION public.get_lead_ai_status(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.leads;
  s public.followup_automation_settings;
  cs public.lead_conversation_state;
  next_task public.lead_followup_tasks;
  steps_count int := 0;
  pending_count int := 0;
  last_inbound timestamptz;
  last_outbound timestamptz;
  reason text := NULL;
  status text := 'unknown';
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','lead_not_found'); END IF;

  -- Auth: visible if owner or workspace member or admin
  IF NOT (
    l.owner_id = auth.uid()
    OR (l.workspace_id IS NOT NULL AND public.is_workspace_member(l.workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  IF l.workspace_id IS NOT NULL THEN
    SELECT * INTO s FROM public.followup_automation_settings WHERE workspace_id = l.workspace_id LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO s FROM public.followup_automation_settings WHERE owner_id = l.owner_id AND workspace_id IS NULL LIMIT 1;
  END IF;

  SELECT * INTO cs FROM public.lead_conversation_state WHERE lead_id = p_lead_id;

  SELECT count(*) INTO steps_count FROM public.followup_sequence_steps
   WHERE is_enabled = true
     AND ((l.workspace_id IS NOT NULL AND workspace_id = l.workspace_id)
          OR (l.workspace_id IS NULL AND workspace_id IS NULL AND owner_id = l.owner_id));

  SELECT count(*) INTO pending_count FROM public.lead_followup_tasks
   WHERE lead_id = p_lead_id AND status IN ('pending','scheduled') AND task_type <> 'manual_call';

  SELECT * INTO next_task FROM public.lead_followup_tasks
   WHERE lead_id = p_lead_id AND status IN ('pending','scheduled') AND task_type <> 'manual_call'
   ORDER BY scheduled_at ASC LIMIT 1;

  SELECT max(sent_at) INTO last_inbound FROM public.whatsapp_messages WHERE lead_id = p_lead_id AND direction = 'inbound';
  SELECT max(sent_at) INTO last_outbound FROM public.whatsapp_messages WHERE lead_id = p_lead_id AND direction = 'outbound';

  -- Determine status + reason
  IF s.id IS NULL THEN
    status := 'blocked'; reason := 'no_settings';
  ELSIF s.is_enabled IS NOT TRUE THEN
    status := 'blocked'; reason := 'automation_disabled';
  ELSIF NOT (l.source = ANY(s.trigger_sources)) THEN
    status := 'blocked'; reason := 'source_not_in_triggers';
  ELSIF steps_count = 0 THEN
    status := 'blocked'; reason := 'no_sequence_steps';
  ELSIF cs.resolved_at IS NOT NULL THEN
    status := 'resolved'; reason := 'conversation_resolved';
  ELSIF cs.automation_paused_at IS NOT NULL THEN
    status := 'paused'; reason := 'manually_paused';
  ELSIF cs.snoozed_until IS NOT NULL AND cs.snoozed_until > now() THEN
    status := 'snoozed'; reason := 'snoozed_until_' || cs.snoozed_until::text;
  ELSIF pending_count = 0 AND last_inbound IS NOT NULL AND (last_outbound IS NULL OR last_inbound > last_outbound) THEN
    status := 'idle_no_task'; reason := 'lead_replied_no_pending_task';
  ELSIF pending_count = 0 THEN
    status := 'idle_no_task'; reason := 'no_pending_task';
  ELSE
    status := 'active'; reason := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', status,
    'reason', reason,
    'settings_found', s.id IS NOT NULL,
    'settings_scope', CASE WHEN s.id IS NULL THEN NULL WHEN s.workspace_id IS NOT NULL THEN 'workspace' ELSE 'owner' END,
    'is_enabled', COALESCE(s.is_enabled, false),
    'trigger_sources', s.trigger_sources,
    'lead_source', l.source,
    'steps_count', steps_count,
    'pending_tasks', pending_count,
    'paused_at', cs.automation_paused_at,
    'snoozed_until', cs.snoozed_until,
    'resolved_at', cs.resolved_at,
    'last_inbound_at', last_inbound,
    'last_outbound_at', last_outbound,
    'next_task', CASE WHEN next_task.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', next_task.id,
      'task_type', next_task.task_type,
      'scheduled_at', next_task.scheduled_at,
      'status', next_task.status
    ) END
  );
END;
$$;

-- 3) RPC de monitoring global (liste leads avec leur état IA)
CREATE OR REPLACE FUNCTION public.list_ai_monitor(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t)) INTO result FROM (
    SELECT
      l.id AS lead_id,
      l.name,
      l.phone,
      l.source,
      l.status,
      l.created_at,
      cs.automation_paused_at,
      cs.snoozed_until,
      cs.resolved_at,
      (SELECT count(*) FROM public.lead_followup_tasks t
        WHERE t.lead_id = l.id AND t.status IN ('pending','scheduled') AND t.task_type <> 'manual_call') AS pending_tasks,
      (SELECT min(scheduled_at) FROM public.lead_followup_tasks t
        WHERE t.lead_id = l.id AND t.status IN ('pending','scheduled') AND t.task_type <> 'manual_call') AS next_scheduled_at,
      (SELECT max(sent_at) FROM public.whatsapp_messages m WHERE m.lead_id = l.id AND m.direction='inbound') AS last_inbound_at,
      (SELECT max(sent_at) FROM public.whatsapp_messages m WHERE m.lead_id = l.id AND m.direction='outbound') AS last_outbound_at
    FROM public.leads l
    LEFT JOIN public.lead_conversation_state cs ON cs.lead_id = l.id
    WHERE l.deleted_at IS NULL
      AND (
        l.owner_id = auth.uid()
        OR (l.workspace_id IS NOT NULL AND public.is_workspace_member(l.workspace_id, auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
    ORDER BY l.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;