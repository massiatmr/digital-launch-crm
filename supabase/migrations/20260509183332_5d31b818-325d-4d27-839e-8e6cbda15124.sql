DROP INDEX IF EXISTS public.whatsapp_templates_owner_waba_name_lang_uidx;

ALTER TABLE public.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_owner_waba_name_lang_key;

ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_owner_waba_name_lang_key
  UNIQUE (owner_id, business_account_id, name, language);
