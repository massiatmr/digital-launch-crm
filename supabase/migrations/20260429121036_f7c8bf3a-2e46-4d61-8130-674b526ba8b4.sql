-- 1. Attribution Meta sur leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_form_id text,
  ADD COLUMN IF NOT EXISTS meta_page_id text;

CREATE INDEX IF NOT EXISTS idx_leads_meta_campaign
  ON public.leads (workspace_id, meta_campaign_id, created_at);

-- 2. Cache campagnes
CREATE TABLE IF NOT EXISTS public.meta_campaigns_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  page_id text NOT NULL,
  ad_account_id text,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'UNKNOWN',
  effective_status text,
  objective text,
  daily_budget numeric,
  lifetime_budget numeric,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_workspace
  ON public.meta_campaigns_cache (workspace_id, status);

ALTER TABLE public.meta_campaigns_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select campaigns_cache"
  ON public.meta_campaigns_cache FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Workspace can insert campaigns_cache"
  ON public.meta_campaigns_cache FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid())
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update campaigns_cache"
  ON public.meta_campaigns_cache FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can delete campaigns_cache"
  ON public.meta_campaigns_cache FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE TRIGGER trg_meta_campaigns_cache_updated
  BEFORE UPDATE ON public.meta_campaigns_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Cache insights
CREATE TABLE IF NOT EXISTS public.meta_campaign_insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  campaign_id text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'EUR',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  leads_meta integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, campaign_id, date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_workspace
  ON public.meta_campaign_insights_cache (workspace_id, campaign_id);

ALTER TABLE public.meta_campaign_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select insights_cache"
  ON public.meta_campaign_insights_cache FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Workspace can insert insights_cache"
  ON public.meta_campaign_insights_cache FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid())
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update insights_cache"
  ON public.meta_campaign_insights_cache FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can delete insights_cache"
  ON public.meta_campaign_insights_cache FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE TRIGGER trg_meta_insights_cache_updated
  BEFORE UPDATE ON public.meta_campaign_insights_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();