
-- ============================================================
-- PHASE 1 : Calendrier par workspace
-- ============================================================

-- ---------- 1. availability_settings ----------
ALTER TABLE public.availability_settings
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.availability_settings s
SET workspace_id = (
  SELECT w.id FROM public.workspaces w
  JOIN public.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = s.owner_id AND wm.role = 'owner'
  ORDER BY w.created_at ASC
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM public.availability_settings a
USING public.availability_settings b
WHERE a.workspace_id = b.workspace_id
  AND a.workspace_id IS NOT NULL
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS availability_settings_workspace_uniq
  ON public.availability_settings(workspace_id) WHERE workspace_id IS NOT NULL;

DROP POLICY IF EXISTS "owner select availability_settings" ON public.availability_settings;
DROP POLICY IF EXISTS "owner insert availability_settings" ON public.availability_settings;
DROP POLICY IF EXISTS "owner update availability_settings" ON public.availability_settings;

CREATE POLICY "Workspace can select availability_settings"
ON public.availability_settings FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace owner can insert availability_settings"
ON public.availability_settings FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
);

CREATE POLICY "Workspace owner can update availability_settings"
ON public.availability_settings FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- ---------- 2. availability_blackouts ----------
ALTER TABLE public.availability_blackouts
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.availability_blackouts b
SET workspace_id = (
  SELECT w.id FROM public.workspaces w
  JOIN public.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = b.owner_id AND wm.role = 'owner'
  ORDER BY w.created_at ASC
  LIMIT 1
)
WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS availability_blackouts_workspace_idx
  ON public.availability_blackouts(workspace_id);

DROP POLICY IF EXISTS "owner select blackouts" ON public.availability_blackouts;
DROP POLICY IF EXISTS "owner insert blackouts" ON public.availability_blackouts;
DROP POLICY IF EXISTS "owner delete blackouts" ON public.availability_blackouts;

CREATE POLICY "Workspace can select blackouts"
ON public.availability_blackouts FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace owner can insert blackouts"
ON public.availability_blackouts FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
);

CREATE POLICY "Workspace owner can delete blackouts"
ON public.availability_blackouts FOR DELETE TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- ---------- 3. google_tokens : ajout workspace_id ----------
ALTER TABLE public.google_tokens
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_freebusy boolean NOT NULL DEFAULT true;

UPDATE public.google_tokens g
SET workspace_id = (
  SELECT w.id FROM public.workspaces w
  JOIN public.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = g.user_id AND wm.role = 'owner'
  ORDER BY w.created_at ASC
  LIMIT 1
)
WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS google_tokens_workspace_idx ON public.google_tokens(workspace_id);

DROP POLICY IF EXISTS "Users can read own tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Users can insert own tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON public.google_tokens;

CREATE POLICY "Workspace members can read google_tokens"
ON public.google_tokens FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace owner can insert google_tokens"
ON public.google_tokens FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace owner can update google_tokens"
ON public.google_tokens FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace owner can delete google_tokens"
ON public.google_tokens FOR DELETE TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND user_id = auth.uid())
);
