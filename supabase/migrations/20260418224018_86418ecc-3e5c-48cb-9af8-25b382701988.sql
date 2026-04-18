-- 1. Enrichir push_subscriptions
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS device_label text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS is_standalone boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_device_idx
  ON public.push_subscriptions(user_id, device_id)
  WHERE device_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions(endpoint);

-- 2. Table d'historique des envois push
CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  device_label text,
  source text NOT NULL DEFAULT 'manual_test',
  title text,
  body_preview text,
  status text NOT NULL,
  provider_status int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_delivery_logs_user_created_idx
  ON public.push_delivery_logs(user_id, created_at DESC);

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read push logs"
  ON public.push_delivery_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert push logs"
  ON public.push_delivery_logs
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can read push logs"
  ON public.push_delivery_logs
  FOR SELECT
  TO public
  USING (auth.role() = 'service_role');