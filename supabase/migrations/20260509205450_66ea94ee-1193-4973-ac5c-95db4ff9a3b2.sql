
-- 1. Filet sécurité automation + triage inbox
ALTER TABLE public.lead_conversation_state
  ADD COLUMN IF NOT EXISTS automation_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conv_state_snoozed ON public.lead_conversation_state (snoozed_until) WHERE snoozed_until IS NOT NULL;

-- 2. Vocaux : résumé IA + metadata libre
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS summary_oneline text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Trigger : auto-pause automation quand owner envoie manuellement
CREATE OR REPLACE FUNCTION public.handle_manual_outbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.direction = 'outbound'
     AND COALESCE((NEW.metadata->>'sent_by_user')::boolean, false) = true THEN
    INSERT INTO public.lead_conversation_state (lead_id, owner_id, workspace_id, automation_paused_at)
    VALUES (NEW.lead_id, NEW.owner_id, NEW.workspace_id, now())
    ON CONFLICT (lead_id) DO UPDATE
      SET automation_paused_at = now(),
          updated_at = now();

    -- annule toutes les relances auto en attente (sauf manual_call qui reste un rappel humain)
    UPDATE public.lead_followup_tasks
    SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.lead_id
      AND status IN ('pending', 'scheduled')
      AND task_type <> 'manual_call';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_manual_outbound ON public.whatsapp_messages;
CREATE TRIGGER trg_handle_manual_outbound
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_manual_outbound();

-- 4. Labels conversations
CREATE TABLE IF NOT EXISTS public.conversation_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#7C3AED',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select labels"
ON public.conversation_labels FOR SELECT TO authenticated
USING (owner_id = auth.uid()
       OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
       OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can insert labels"
ON public.conversation_labels FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid()
            AND (workspace_id IS NULL OR is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can update labels"
ON public.conversation_labels FOR UPDATE TO authenticated
USING (owner_id = auth.uid()
       OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can delete labels"
ON public.conversation_labels FOR DELETE TO authenticated
USING (owner_id = auth.uid()
       OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())));

CREATE TABLE IF NOT EXISTS public.conversation_label_assignments (
  lead_id uuid NOT NULL,
  label_id uuid NOT NULL REFERENCES public.conversation_labels(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_label_assign_lead ON public.conversation_label_assignments (lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_label_assign_workspace ON public.conversation_label_assignments (workspace_id);

ALTER TABLE public.conversation_label_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select label assignments"
ON public.conversation_label_assignments FOR SELECT TO authenticated
USING (owner_id = auth.uid()
       OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
       OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can insert label assignments"
ON public.conversation_label_assignments FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid()
            AND (workspace_id IS NULL OR is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can delete label assignments"
ON public.conversation_label_assignments FOR DELETE TO authenticated
USING (owner_id = auth.uid()
       OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())));
