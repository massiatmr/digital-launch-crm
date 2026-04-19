-- 1) Mettre à jour le trigger inbound pour créer une nouvelle tâche qualification à chaque réponse
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
    -- MAJ état conversation
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, state, last_inbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, 'QUALIFIED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET state = CASE
        WHEN public.lead_conversation_state.state IN ('BOOKED', 'CLOSED') THEN public.lead_conversation_state.state
        ELSE 'QUALIFIED'::public.conversation_state
      END,
      last_inbound_at = NEW.sent_at,
      updated_at = now();

    SELECT state INTO current_state FROM public.lead_conversation_state WHERE lead_id = NEW.lead_id;

    -- Annuler relances séquentielles en attente (on prend le contrôle de la convo)
    UPDATE public.lead_followup_tasks
    SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.lead_id
      AND status IN ('pending', 'scheduled')
      AND task_type IN ('followup_1', 'followup_2', 'last_followup', 'initial_message');

    -- Si lead pas encore booked/closed → créer une NOUVELLE tâche qualification (réponse IA contextuelle)
    IF current_state NOT IN ('BOOKED', 'CLOSED') THEN
      INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
      VALUES (NEW.lead_id, NEW.owner_id, 'qualification', 'scheduled', now(), 99);
    END IF;

  ELSIF NEW.direction = 'outbound' THEN
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, state, last_outbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, 'CONTACTED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET last_outbound_at = NEW.sent_at,
          state = CASE
            WHEN public.lead_conversation_state.state = 'NEW' THEN 'CONTACTED'::public.conversation_state
            ELSE public.lead_conversation_state.state
          END,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;