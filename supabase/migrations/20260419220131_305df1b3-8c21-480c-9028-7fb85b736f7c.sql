
-- Make whatsapp_config and meta_pages truly per-workspace.

-- 1) Drop the global unique on whatsapp_config(owner_id)
ALTER TABLE public.whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_owner_id_key;

-- 2) Allow multiple configs per owner, one per workspace.
--    Unique on workspace_id when not null.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_workspace_id_unique
  ON public.whatsapp_config (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- 3) For meta_pages, ensure unique per (workspace_id, page_id) instead of (owner_id, page_id).
--    Drop legacy owner-based uniques if any, and add the new one.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.meta_pages'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.meta_pages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS meta_pages_workspace_page_unique
  ON public.meta_pages (workspace_id, page_id)
  WHERE workspace_id IS NOT NULL;

-- Keep a fallback unique for rows without workspace (legacy)
CREATE UNIQUE INDEX IF NOT EXISTS meta_pages_owner_page_unique_legacy
  ON public.meta_pages (owner_id, page_id)
  WHERE workspace_id IS NULL;
