-- ============================================================
-- AUTOMATISATION SUIVI WHATSAPP — couche additive
-- Ne modifie ni `leads` ni le pipeline existant
-- ============================================================

-- 1) ENUMS
CREATE TYPE public.followup_task_type AS ENUM (
  'initial_message',
  'followup_1',
  'followup_2',
  'last_followup',
  'qualification',
  'propose_meeting'
);

CREATE TYPE public.followup_task_status AS ENUM (
  'pending',
  'scheduled',
  'sent',
  'cancelled',
  'failed',
  'skipped'
);

CREATE TYPE public.conversation_state AS ENUM (
  'NEW',
  'CONTACTED',
  'WAITING_REPLY',
  'FOLLOWUP_1_SENT',
  'FOLLOWUP_2_SENT',
  'QUALIFIED',
  'BOOKED',
  'CLOSED'
);

CREATE TYPE public.wa_direction AS ENUM ('inbound', 'outbound');

-- 2) TABLE: lead_followup_tasks
CREATE TABLE public.lead_followup_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  task_type public.followup_task_type NOT NULL,
  status public.followup_task_status NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  message_content TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  step_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_tasks_lead ON public.lead_followup_tasks(lead_id);
CREATE INDEX idx_followup_tasks_due ON public.lead_followup_tasks(scheduled_at) 
  WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_followup_tasks_owner ON public.lead_followup_tasks(owner_id);

ALTER TABLE public.lead_followup_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select followup_tasks" ON public.lead_followup_tasks
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert followup_tasks" ON public.lead_followup_tasks
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update followup_tasks" ON public.lead_followup_tasks
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete followup_tasks" ON public.lead_followup_tasks
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER trg_followup_tasks_updated_at
  BEFORE UPDATE ON public.lead_followup_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) TABLE: whatsapp_messages
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  direction public.wa_direction NOT NULL,
  content TEXT NOT NULL,
  wa_message_id TEXT,
  task_id UUID REFERENCES public.lead_followup_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_messages_lead ON public.whatsapp_messages(lead_id, sent_at DESC);
CREATE INDEX idx_wa_messages_owner ON public.whatsapp_messages(owner_id);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select wa_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert wa_messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can delete wa_messages" ON public.whatsapp_messages
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 4) TABLE: lead_conversation_state
CREATE TABLE public.lead_conversation_state (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  state public.conversation_state NOT NULL DEFAULT 'NEW',
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select conv_state" ON public.lead_conversation_state
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert conv_state" ON public.lead_conversation_state
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update conv_state" ON public.lead_conversation_state
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete conv_state" ON public.lead_conversation_state
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER trg_conv_state_updated_at
  BEFORE UPDATE ON public.lead_conversation_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) TABLE: followup_automation_settings (1 ligne par owner)
CREATE TABLE public.followup_automation_settings (
  owner_id UUID PRIMARY KEY DEFAULT auth.uid(),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_instructions TEXT NOT NULL DEFAULT 'Tu es un assistant commercial humain et bienveillant. Réponds en français, court (max 2 phrases), pose UNE seule question à la fois pour qualifier le lead progressivement (besoin, budget, urgence). Quand le lead est chaud, propose un rendez-vous.',
  ai_examples TEXT NOT NULL DEFAULT '',
  initial_delay_minutes INTEGER NOT NULL DEFAULT 0,
  followup_1_delay_hours INTEGER NOT NULL DEFAULT 24,
  followup_2_delay_hours INTEGER NOT NULL DEFAULT 48,
  last_followup_delay_hours INTEGER NOT NULL DEFAULT 72,
  ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.followup_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select settings" ON public.followup_automation_settings
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert settings" ON public.followup_automation_settings
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update settings" ON public.followup_automation_settings
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.followup_automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) FONCTION: créer la séquence de tâches pour un lead
CREATE OR REPLACE FUNCTION public.create_followup_sequence_for_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.followup_automation_settings;
BEGIN
  -- Charger settings du owner (créer ligne par défaut si absente)
  SELECT * INTO s FROM public.followup_automation_settings WHERE owner_id = NEW.owner_id;
  IF NOT FOUND THEN
    INSERT INTO public.followup_automation_settings (owner_id) VALUES (NEW.owner_id)
    RETURNING * INTO s;
  END IF;

  IF s.is_enabled IS NOT TRUE THEN
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

  -- 2. Relance 1 (+24h)
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'followup_1', 'scheduled',
          now() + (s.followup_1_delay_hours || ' hours')::interval, 2);

  -- 3. Relance 2 (+48h cumulé)
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'followup_2', 'scheduled',
          now() + (s.followup_2_delay_hours || ' hours')::interval, 3);

  -- 4. Dernière relance (+72h cumulé)
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'last_followup', 'scheduled',
          now() + (s.last_followup_delay_hours || ' hours')::interval, 4);

  -- 5 & 6 : créées au moment où le lead répond / est qualifié (placeholders pending sans schedule)
  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'qualification', 'pending', now() + interval '100 years', 5);

  INSERT INTO public.lead_followup_tasks (lead_id, owner_id, task_type, status, scheduled_at, step_order)
  VALUES (NEW.id, NEW.owner_id, 'propose_meeting', 'pending', now() + interval '100 years', 6);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_followup_sequence
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.create_followup_sequence_for_lead();

-- 7) FONCTION: à la réception d'un message inbound -> annuler relances + déclencher qualification
CREATE OR REPLACE FUNCTION public.handle_inbound_whatsapp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    -- MAJ état conversation
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, state, last_inbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, 'QUALIFIED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET state = 'QUALIFIED', last_inbound_at = NEW.sent_at, updated_at = now();

    -- Annuler toutes les relances en attente
    UPDATE public.lead_followup_tasks
    SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.lead_id
      AND status IN ('pending', 'scheduled')
      AND task_type IN ('followup_1', 'followup_2', 'last_followup', 'initial_message');

    -- Déclencher la tâche qualification (la rendre due maintenant)
    UPDATE public.lead_followup_tasks
    SET status = 'scheduled', scheduled_at = now(), updated_at = now()
    WHERE lead_id = NEW.lead_id
      AND task_type = 'qualification'
      AND status = 'pending';

  ELSIF NEW.direction = 'outbound' THEN
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, state, last_outbound_at)
    VALUES (NEW.lead_id, NEW.owner_id, 'CONTACTED', NEW.sent_at)
    ON CONFLICT (lead_id) DO UPDATE
      SET last_outbound_at = NEW.sent_at,
          state = CASE
            WHEN public.lead_conversation_state.state IN ('NEW') THEN 'CONTACTED'::public.conversation_state
            ELSE public.lead_conversation_state.state
          END,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_inbound_whatsapp
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_inbound_whatsapp();