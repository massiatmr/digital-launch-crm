ALTER TABLE public.meta_oauth_pending
  ADD COLUMN IF NOT EXISTS ad_accounts jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  workspace_id uuid,
  ad_account_id text NOT NULL,
  account_id text,
  account_name text NOT NULL DEFAULT '',
  currency text,
  business_id text,
  business_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ad_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_accounts TO authenticated;
GRANT ALL ON public.meta_ad_accounts TO service_role;

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can view meta ad accounts"
  ON public.meta_ad_accounts FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Workspace can insert meta ad accounts"
  ON public.meta_ad_accounts FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update meta ad accounts"
  ON public.meta_ad_accounts FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can delete meta ad accounts"
  ON public.meta_ad_accounts FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_workspace
  ON public.meta_ad_accounts (workspace_id, is_active);

CREATE TRIGGER trg_meta_ad_accounts_updated
  BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();