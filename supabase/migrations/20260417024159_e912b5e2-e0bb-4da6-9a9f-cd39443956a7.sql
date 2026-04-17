CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() UNIQUE,
  phone_number_id text NOT NULL,
  business_account_id text NOT NULL,
  access_token text NOT NULL,
  display_phone_number text DEFAULT '',
  verified_name text DEFAULT '',
  verify_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  webhook_subscribed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_status text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select own wa config"
  ON public.whatsapp_config FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert own wa config"
  ON public.whatsapp_config FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update own wa config"
  ON public.whatsapp_config FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete own wa config"
  ON public.whatsapp_config FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX idx_whatsapp_config_phone_number_id ON public.whatsapp_config(phone_number_id);
CREATE INDEX idx_whatsapp_config_verify_token ON public.whatsapp_config(verify_token);

CREATE TRIGGER update_whatsapp_config_updated_at
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();