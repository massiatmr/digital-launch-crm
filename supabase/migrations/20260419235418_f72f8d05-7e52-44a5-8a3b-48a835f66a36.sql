-- =========================================================================
-- LAYER 1: SOFT-DELETE COLUMNS
-- =========================================================================
ALTER TABLE public.workspaces           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.leads                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.clients              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.offers               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.bookings             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.invoices             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.contract_signatures  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_at          ON public.workspaces (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at               ON public.leads (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at             ON public.clients (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offers_deleted_at              ON public.offers (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at            ON public.bookings (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at            ON public.invoices (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_signatures_deleted_at ON public.contract_signatures (deleted_at) WHERE deleted_at IS NOT NULL;

-- =========================================================================
-- LAYER 1bis: REMPLACER CASCADE -> RESTRICT sur les FK workspace_id
-- des tables porteuses de données métier (empêche la suppression brutale)
-- =========================================================================
DO $$
DECLARE
  r RECORD;
  tbls TEXT[] := ARRAY['leads','clients','offers','bookings','invoices','contract_signatures'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = ('public.'||t)::regclass
        AND contype = 'f'
        AND confrelid = 'public.workspaces'::regclass
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT',
      t, t||'_workspace_id_fkey'
    );
  END LOOP;
END $$;

-- =========================================================================
-- LAYER 1ter: RLS — filtrer deleted_at IS NULL automatiquement
-- (on remplace les SELECT policies existantes)
-- =========================================================================

-- workspaces : on n'a pas de policy SELECT explicite listée, mais on en ajoute
-- (ou remplace) pour cacher les soft-deleted
DROP POLICY IF EXISTS "Workspace members can view non-deleted workspaces" ON public.workspaces;
CREATE POLICY "Workspace members can view non-deleted workspaces"
ON public.workspaces FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (is_workspace_member(id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Admins can view all workspaces including deleted" ON public.workspaces;
CREATE POLICY "Admins can view all workspaces including deleted"
ON public.workspaces FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- leads
DROP POLICY IF EXISTS "Workspace can select leads" ON public.leads;
CREATE POLICY "Workspace can select leads"
ON public.leads FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
DROP POLICY IF EXISTS "Admins can view deleted leads" ON public.leads;
CREATE POLICY "Admins can view deleted leads"
ON public.leads FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- clients
DROP POLICY IF EXISTS "Workspace can select clients" ON public.clients;
CREATE POLICY "Workspace can select clients"
ON public.clients FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
DROP POLICY IF EXISTS "Admins can view deleted clients" ON public.clients;
CREATE POLICY "Admins can view deleted clients"
ON public.clients FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- offers
DROP POLICY IF EXISTS "Workspace can select offers" ON public.offers;
CREATE POLICY "Workspace can select offers"
ON public.offers FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
DROP POLICY IF EXISTS "Public can view active offers" ON public.offers;
CREATE POLICY "Public can view active offers"
ON public.offers FOR SELECT TO anon
USING (is_active = true AND deleted_at IS NULL);

-- bookings
DROP POLICY IF EXISTS "Workspace can select bookings" ON public.bookings;
CREATE POLICY "Workspace can select bookings"
ON public.bookings FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- invoices
DROP POLICY IF EXISTS "Owner can select invoices" ON public.invoices;
CREATE POLICY "Owner can select invoices"
ON public.invoices FOR SELECT TO authenticated
USING (deleted_at IS NULL AND (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));

-- contract_signatures
DROP POLICY IF EXISTS "Owner can select contract_signatures" ON public.contract_signatures;
CREATE POLICY "Owner can select contract_signatures"
ON public.contract_signatures FOR SELECT TO authenticated
USING (deleted_at IS NULL AND (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));

-- =========================================================================
-- LAYER 4: AUDIT LOG
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  user_id      UUID,
  action       TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','SOFT_DELETE','RESTORE')),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  snapshot     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON public.audit_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity    ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action    ON public.audit_log (action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
CREATE POLICY "Admins can read audit_log"
ON public.audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages audit_log" ON public.audit_log;
CREATE POLICY "Service role manages audit_log"
ON public.audit_log FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Trigger générique
CREATE OR REPLACE FUNCTION public.log_entity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_snapshot JSONB;
  v_entity_id UUID;
  v_workspace_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_snapshot := to_jsonb(OLD);
    v_entity_id := OLD.id;
    v_workspace_id := CASE WHEN TG_TABLE_NAME = 'workspaces' THEN OLD.id ELSE (to_jsonb(OLD)->>'workspace_id')::uuid END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD)->>'deleted_at') IS NULL AND (to_jsonb(NEW)->>'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF (to_jsonb(OLD)->>'deleted_at') IS NOT NULL AND (to_jsonb(NEW)->>'deleted_at') IS NULL THEN
      v_action := 'RESTORE';
    ELSE
      RETURN NEW; -- on ne loggue pas les UPDATE ordinaires
    END IF;
    v_snapshot := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_workspace_id := CASE WHEN TG_TABLE_NAME = 'workspaces' THEN NEW.id ELSE (to_jsonb(NEW)->>'workspace_id')::uuid END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, snapshot)
  VALUES (v_workspace_id, auth.uid(), v_action, TG_TABLE_NAME, v_entity_id, v_snapshot);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY['workspaces','leads','clients','offers','invoices','contract_signatures','bookings'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_entity_changes()',
      t, t
    );
  END LOOP;
END $$;

-- =========================================================================
-- LAYER 2: RPC restore_from_snapshot (admin only)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.restore_from_snapshot(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.audit_log;
  exists_check BOOLEAN;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO rec FROM public.audit_log WHERE id = p_audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot_not_found';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', rec.entity_type)
    USING rec.entity_id INTO exists_check;

  IF exists_check THEN
    -- restauration "logique" : on enlève deleted_at si présent
    EXECUTE format('UPDATE public.%I SET deleted_at = NULL WHERE id = $1', rec.entity_type)
      USING rec.entity_id;
    RETURN jsonb_build_object('success', true, 'mode', 'undeleted', 'entity_id', rec.entity_id);
  ELSE
    -- ré-insertion depuis snapshot
    EXECUTE format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
      rec.entity_type, rec.entity_type
    ) USING (rec.snapshot - 'deleted_at');
    RETURN jsonb_build_object('success', true, 'mode', 'reinserted', 'entity_id', rec.entity_id);
  END IF;
END;
$$;

-- =========================================================================
-- LAYER 9: cron de purge (DELETE physique après 30 jours soft-deleted)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INT := 0;
  cnt INT;
  t TEXT;
  tbls TEXT[] := ARRAY['leads','clients','offers','bookings','invoices','contract_signatures','workspaces'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval ''30 days''', t);
    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;
  END LOOP;

  -- purge audit_log > 90 jours
  DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';

  RETURN jsonb_build_object('purged_rows', total, 'purged_at', now());
END;
$$;