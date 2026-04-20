-- 1. Table lead_qualification
CREATE TABLE IF NOT EXISTS public.lead_qualification (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  pain_point TEXT DEFAULT '',
  urgency TEXT DEFAULT 'unclear',
  budget_signal TEXT DEFAULT 'unknown',
  decision_maker TEXT DEFAULT 'unknown',
  objections JSONB NOT NULL DEFAULT '[]'::jsonb,
  interest_level INT NOT NULL DEFAULT 0,
  intent TEXT DEFAULT 'unknown',
  summary TEXT DEFAULT '',
  last_qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_qualification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select qualification" ON public.lead_qualification
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can insert qualification" ON public.lead_qualification
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can update qualification" ON public.lead_qualification
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can delete qualification" ON public.lead_qualification
FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid())));

CREATE TRIGGER set_lead_qualification_updated_at
BEFORE UPDATE ON public.lead_qualification
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Colonnes additionnelles
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_engagement_score INT NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE public.lead_followup_tasks ADD COLUMN IF NOT EXISTS message_variant TEXT;

ALTER TABLE public.followup_automation_settings
  ADD COLUMN IF NOT EXISTS prompt_qualification TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_objection TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_closing TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_reactivation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enable_ab_test BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_stop_on_not_interested BOOLEAN NOT NULL DEFAULT true;

-- 3. Trigger : recalcul du score d'engagement WhatsApp
CREATE OR REPLACE FUNCTION public.recalc_whatsapp_engagement_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inbound_count INT := 0;
  long_count INT := 0;
  fast_replies INT := 0;
  silent_penalty INT := 0;
  intent_bonus INT := 0;
  last_out TIMESTAMPTZ;
  base INT := 0;
BEGIN
  SELECT COUNT(*) INTO inbound_count
    FROM public.whatsapp_messages WHERE lead_id = NEW.lead_id AND direction = 'inbound';

  SELECT COUNT(*) INTO long_count
    FROM public.whatsapp_messages
    WHERE lead_id = NEW.lead_id AND direction = 'inbound' AND length(content) > 50;

  -- réactivité : inbound dans 10 min après outbound
  SELECT COUNT(*) INTO fast_replies
    FROM public.whatsapp_messages w_in
    WHERE w_in.lead_id = NEW.lead_id AND w_in.direction = 'inbound'
      AND EXISTS (
        SELECT 1 FROM public.whatsapp_messages w_out
         WHERE w_out.lead_id = NEW.lead_id AND w_out.direction = 'outbound'
           AND w_out.sent_at < w_in.sent_at
           AND w_in.sent_at - w_out.sent_at < interval '10 minutes'
      );

  SELECT COUNT(*) * 30 INTO intent_bonus
    FROM public.whatsapp_messages
    WHERE lead_id = NEW.lead_id AND intent = 'ready_to_book';

  SELECT MAX(sent_at) INTO last_out
    FROM public.whatsapp_messages WHERE lead_id = NEW.lead_id AND direction = 'outbound';
  IF last_out IS NOT NULL AND now() - last_out > interval '48 hours' THEN
    silent_penalty := -20;
  END IF;

  base := (inbound_count * 5) + (long_count * 10) + (fast_replies * 20) + intent_bonus + silent_penalty;
  base := GREATEST(0, LEAST(100, base));

  UPDATE public.leads SET whatsapp_engagement_score = base WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_engagement_after_wa_msg ON public.whatsapp_messages;
CREATE TRIGGER recalc_engagement_after_wa_msg
AFTER INSERT OR UPDATE ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.recalc_whatsapp_engagement_score();