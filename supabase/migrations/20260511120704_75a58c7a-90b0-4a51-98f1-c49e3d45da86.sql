CREATE OR REPLACE FUNCTION public.list_ai_monitor(p_limit integer DEFAULT 100, p_workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        p_workspace_id IS NULL
        OR l.workspace_id = p_workspace_id
      )
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
$function$;