-- Phase 2 : calendar_accounts (multi-providers)

CREATE TYPE public.calendar_provider AS ENUM ('google','microsoft','caldav','ical');

CREATE TABLE public.calendar_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider public.calendar_provider NOT NULL,
  display_name text,
  is_primary boolean NOT NULL DEFAULT false,
  sync_freebusy boolean NOT NULL DEFAULT true,
  calendar_id text,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  external_busy_cache jsonb,
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_accounts_workspace ON public.calendar_accounts(workspace_id);
CREATE UNIQUE INDEX uniq_calendar_accounts_one_primary
  ON public.calendar_accounts(workspace_id)
  WHERE is_primary = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_accounts TO authenticated;
GRANT ALL ON public.calendar_accounts TO service_role;

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view workspace calendar accounts"
  ON public.calendar_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "owners can insert calendar accounts"
  ON public.calendar_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "owners can update calendar accounts"
  ON public.calendar_accounts FOR UPDATE TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "owners can delete calendar accounts"
  ON public.calendar_accounts FOR DELETE TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_calendar_accounts_updated_at
  BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill depuis google_tokens (uniquement les lignes avec workspace_id)
INSERT INTO public.calendar_accounts (workspace_id, provider, display_name, is_primary, sync_freebusy, calendar_id, access_token, refresh_token, expires_at, credentials, created_by, created_at, updated_at)
SELECT
  gt.workspace_id,
  'google'::public.calendar_provider,
  'Google Calendar',
  COALESCE(gt.is_primary, true),
  COALESCE(gt.sync_freebusy, true),
  'primary',
  gt.access_token,
  gt.refresh_token,
  gt.expires_at,
  jsonb_build_object('source','google_tokens_backfill','user_id', gt.user_id),
  gt.user_id,
  COALESCE(gt.created_at, now()),
  now()
FROM public.google_tokens gt
WHERE gt.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.calendar_accounts ca
    WHERE ca.workspace_id = gt.workspace_id AND ca.provider = 'google'
  );
