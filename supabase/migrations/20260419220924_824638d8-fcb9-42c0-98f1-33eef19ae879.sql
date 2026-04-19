-- Drop the workspace-only unique index to allow multiple WA numbers per workspace
DROP INDEX IF EXISTS public.whatsapp_config_workspace_id_unique;

-- Add unique constraint on (workspace_id, phone_number_id) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_workspace_phone_unique
ON public.whatsapp_config (workspace_id, phone_number_id)
WHERE workspace_id IS NOT NULL;

-- Also add unique on (owner_id, phone_number_id) for legacy rows without workspace
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_owner_phone_unique
ON public.whatsapp_config (owner_id, phone_number_id)
WHERE workspace_id IS NULL;