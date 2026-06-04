
-- Fix availability_settings: PK on owner_id only prevented multi-workspace rows
ALTER TABLE public.availability_settings DROP CONSTRAINT IF EXISTS availability_settings_pkey;
ALTER TABLE public.availability_settings ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.availability_settings ADD CONSTRAINT availability_settings_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS availability_settings_owner_ws_uniq
  ON public.availability_settings (owner_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Same safety for blackouts so two workspaces of the same owner don't collide on a date
ALTER TABLE public.availability_blackouts DROP CONSTRAINT IF EXISTS availability_blackouts_owner_id_blackout_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS availability_blackouts_owner_ws_date_uniq
  ON public.availability_blackouts (owner_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), blackout_date);
