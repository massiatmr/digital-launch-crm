CREATE OR REPLACE FUNCTION public.handle_inbound_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_state public.conversation_state;
BEGIN
  IF NEW.direction = 'inbound' THEN
    -- Si un ancien lead perdu revient par WhatsApp, on le rouvre automatiquement.
    -- Sinon execute-followup-task annule la réponse IA avec "Skipped: lead status=lost".
    UPDATE public.leads
    SET status = 'qualified',
        lost_reason = NULL,
        updated_at = now()
    WHERE id = NEW.lead_id
      AND status = 'lost';

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

    SELECT state INTO current_state FROM public.lead_conversation_state WHERE lead_id = NEW.lead_id;

    -- Annule les relances séquentielles en attente (le prospect a repris la main)
    UPDATE public.lead_followup_tasks
    SET status = 'cancelled', updated_at = now(),
        error_message = COALESCE(error_message, 'Annulée : réponse du lead reçue')
    WHERE lead_id = NEW.lead_id
      AND status IN ('pending', 'scheduled')
      AND task_type <> 'manual_call'
      AND task_type <> 'qualification';

    -- Filet de sécurité : garantir qu'une vraie tâche qualification proche est toujours en file.
    -- On ignore les anciens placeholders planifiés à +100 ans, qui bloquaient les réponses IA.
    IF current_state NOT IN ('BOOKED', 'CLOSED') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.lead_followup_tasks
         WHERE lead_id = NEW.lead_id
           AND task_type = 'qualification'
           AND status IN ('pending', 'scheduled', 'processing')
           AND scheduled_at <= now() + interval '5 minutes'
      ) THEN
        INSERT INTO public.lead_followup_tasks
          (lead_id, owner_id, workspace_id, task_type, status, scheduled_at, step_order)
        VALUES
          (NEW.lead_id, NEW.owner_id, NEW.workspace_id, 'qualification', 'scheduled',
           now() + interval '45 seconds', 99);
      END IF;
    END IF;

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