ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS business_account_id text;

-- Replace old unique constraint to allow same template name across different WABAs
ALTER TABLE public.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_owner_id_name_language_key;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_owner_waba_name_lang_uidx
  ON public.whatsapp_templates (owner_id, COALESCE(business_account_id, ''), name, language);
