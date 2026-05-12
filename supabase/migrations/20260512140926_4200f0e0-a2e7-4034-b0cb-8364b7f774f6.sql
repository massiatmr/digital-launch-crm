-- 1. Channel enum
DO $$ BEGIN
  CREATE TYPE public.message_channel AS ENUM ('whatsapp', 'messenger', 'instagram');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend whatsapp_messages with channel + external_thread_id
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS channel public.message_channel NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_thread_id text;

CREATE INDEX IF NOT EXISTS idx_wa_messages_channel ON public.whatsapp_messages(channel);
CREATE INDEX IF NOT EXISTS idx_wa_messages_external_thread ON public.whatsapp_messages(external_thread_id) WHERE external_thread_id IS NOT NULL;

-- 3. Lead source enum extension
ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'instagram';

-- 4. Meta channel identities (per workspace)
CREATE TABLE IF NOT EXISTS public.meta_channel_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  page_id text NOT NULL,
  page_name text NOT NULL DEFAULT '',
  page_access_token text NOT NULL DEFAULT '',
  instagram_business_account_id text,
  instagram_username text,
  is_subscribed_messages boolean NOT NULL DEFAULT false,
  is_subscribed_instagram boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_channel_identities_workspace ON public.meta_channel_identities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_channel_identities_ig ON public.meta_channel_identities(instagram_business_account_id) WHERE instagram_business_account_id IS NOT NULL;

ALTER TABLE public.meta_channel_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select meta_channel_identities"
  ON public.meta_channel_identities FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Workspace can insert meta_channel_identities"
  ON public.meta_channel_identities FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can update meta_channel_identities"
  ON public.meta_channel_identities FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can delete meta_channel_identities"
  ON public.meta_channel_identities FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid())));

CREATE POLICY "Service role manages meta_channel_identities"
  ON public.meta_channel_identities FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_meta_channel_identities_updated
  BEFORE UPDATE ON public.meta_channel_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();