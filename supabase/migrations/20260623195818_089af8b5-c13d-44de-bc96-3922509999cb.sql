
-- Enums
DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','running','completed','cancelled','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_recipient_status AS ENUM ('pending','sent','delivered','read','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  template_name text,
  template_language text DEFAULT 'fr',
  template_variables_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_mode text NOT NULL DEFAULT 'manual',
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  total_recipients int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  read_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_message text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_members" ON public.campaigns FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "campaigns_insert_owner" ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid() AND (
    workspace_id IS NULL
    OR public.is_workspace_member(workspace_id, auth.uid())
  )
);

CREATE POLICY "campaigns_update_owner" ON public.campaigns FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "campaigns_delete_owner" ON public.campaigns FOR DELETE TO authenticated
USING (
  owner_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON public.campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled ON public.campaigns(status, scheduled_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table campaign_recipients
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text,
  resolved_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.campaign_recipient_status NOT NULL DEFAULT 'pending',
  wa_message_id text,
  whatsapp_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_recipients_select" ON public.campaign_recipients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_recipients.campaign_id
      AND c.deleted_at IS NULL
      AND (
        c.owner_id = auth.uid()
        OR (c.workspace_id IS NOT NULL AND public.is_workspace_member(c.workspace_id, auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "campaign_recipients_insert" ON public.campaign_recipients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_recipients.campaign_id
      AND (
        c.owner_id = auth.uid()
        OR (c.workspace_id IS NOT NULL AND public.is_workspace_owner(c.workspace_id, auth.uid()))
      )
  )
);

CREATE POLICY "campaign_recipients_update" ON public.campaign_recipients FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_recipients.campaign_id
      AND (
        c.owner_id = auth.uid()
        OR (c.workspace_id IS NOT NULL AND public.is_workspace_owner(c.workspace_id, auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "campaign_recipients_delete" ON public.campaign_recipients FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_recipients.campaign_id
      AND (
        c.owner_id = auth.uid()
        OR (c.workspace_id IS NOT NULL AND public.is_workspace_owner(c.workspace_id, auth.uid()))
      )
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_wa_message_id ON public.campaign_recipients(wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TRIGGER trg_campaign_recipients_updated_at
BEFORE UPDATE ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
