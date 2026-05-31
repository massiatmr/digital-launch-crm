ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS app_secret text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'global';