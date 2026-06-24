DROP TRIGGER IF EXISTS trg_whatsapp_handle_inbound ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_handle_manual_outbound ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_recalc_engagement ON public.whatsapp_messages;