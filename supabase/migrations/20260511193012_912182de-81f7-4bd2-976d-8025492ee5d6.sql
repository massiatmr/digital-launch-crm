CREATE OR REPLACE FUNCTION public.handle_inbound_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.direction = 'inbound' THEN
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, state, last_inbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, NEW.workspace_id, 'QUALIFIED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET state = CASE
        WHEN public.lead_conversation_state.state IN ('BOOKED', 'CLOSED') THEN public.lead_conversation_state.state
        ELSE 'QUALIFIED'::public.conversation_state
      END,
      workspace_id = COALESCE(EXCLUDED.workspace_id, public.lead_conversation_state.workspace_id),
      last_inbound_at = NEW.sent_at,
      updated_at = now();

    -- Annuler les relances automatiques en attente dès que le prospect répond.
    -- La prochaine action IA est maintenant décidée par qualify-conversation,
    -- après analyse de l'intention, pour éviter les réponses génériques trop rapides.
    UPDATE public.lead_followup_tasks
    SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.lead_id
      AND status IN ('pending', 'scheduled')
      AND task_type <> 'manual_call';

  ELSIF NEW.direction = 'outbound' THEN
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, state, last_outbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, NEW.workspace_id, 'CONTACTED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET last_outbound_at = NEW.sent_at,
          workspace_id = COALESCE(EXCLUDED.workspace_id, public.lead_conversation_state.workspace_id),
          state = CASE
            WHEN public.lead_conversation_state.state = 'NEW' THEN 'CONTACTED'::public.conversation_state
            ELSE public.lead_conversation_state.state
          END,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.lead_conversation_state cs
SET workspace_id = l.workspace_id
FROM public.leads l
WHERE cs.lead_id = l.id
  AND cs.workspace_id IS DISTINCT FROM l.workspace_id;

UPDATE public.lead_followup_tasks t
SET workspace_id = l.workspace_id
FROM public.leads l
WHERE t.lead_id = l.id
  AND t.workspace_id IS DISTINCT FROM l.workspace_id;