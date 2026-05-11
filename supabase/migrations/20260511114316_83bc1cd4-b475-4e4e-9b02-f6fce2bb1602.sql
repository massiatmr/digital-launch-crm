CREATE OR REPLACE FUNCTION public.get_lead_ai_status(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l public.leads;
  s public.followup_automation_settings;
  cs public.lead_conversation_state;
  next_task public.lead_followup_tasks;
  steps_count int := 0;
  pending_count int := 0;
  last_inbound timestamptz;
  last_outbound timestamptz;
  v_reason text := NULL;
  v_status text := 'unknown';
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','lead_not_found'); END IF;

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

  SELECT count(*) INTO steps_count FROM public.followup_sequence_steps fss
   WHERE fss.is_enabled = true
     AND ((l.workspace_id IS NOT NULL AND fss.workspace_id = l.workspace_id)
          OR (l.workspace_id IS NULL AND fss.workspace_id IS NULL AND fss.owner_id = l.owner_id));

  SELECT count(*) INTO pending_count FROM public.lead_followup_tasks t
   WHERE t.lead_id = p_lead_id AND t.status IN ('pending','scheduled') AND t.task_type <> 'manual_call';

  SELECT * INTO next_task FROM public.lead_followup_tasks t
   WHERE t.lead_id = p_lead_id AND t.status IN ('pending','scheduled') AND t.task_type <> 'manual_call'
   ORDER BY t.scheduled_at ASC LIMIT 1;

  SELECT max(sent_at) INTO last_inbound FROM public.whatsapp_messages WHERE lead_id = p_lead_id AND direction = 'inbound';
  SELECT max(sent_at) INTO last_outbound FROM public.whatsapp_messages WHERE lead_id = p_lead_id AND direction = 'outbound';

  IF s.id IS NULL THEN
    v_status := 'blocked'; v_reason := 'no_settings';
  ELSIF s.is_enabled IS NOT TRUE THEN
    v_status := 'blocked'; v_reason := 'automation_disabled';
  ELSIF NOT (l.source = ANY(s.trigger_sources)) THEN
    v_status := 'blocked'; v_reason := 'source_not_in_triggers';
  ELSIF steps_count = 0 THEN
    v_status := 'blocked'; v_reason := 'no_sequence_steps';
  ELSIF cs.resolved_at IS NOT NULL THEN
    v_status := 'resolved'; v_reason := 'conversation_resolved';
  ELSIF cs.automation_paused_at IS NOT NULL THEN
    v_status := 'paused'; v_reason := 'manually_paused';
  ELSIF cs.snoozed_until IS NOT NULL AND cs.snoozed_until > now() THEN
    v_status := 'snoozed'; v_reason := 'snoozed_until_' || cs.snoozed_until::text;
  ELSIF pending_count = 0 AND last_inbound IS NOT NULL AND (last_outbound IS NULL OR last_inbound > last_outbound) THEN
    v_status := 'idle_no_task'; v_reason := 'lead_replied_no_pending_task';
  ELSIF pending_count = 0 THEN
    v_status := 'idle_no_task'; v_reason := 'no_pending_task';
  ELSE
    v_status := 'active'; v_reason := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'reason', v_reason,
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
$function$;