DROP TRIGGER IF EXISTS trg_whatsapp_update_lead_last_contacted ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_update_lead_first_contacted ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_handle_inbound ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_handle_manual_outbound ON public.whatsapp_messages;
DROP TRIGGER IF EXISTS trg_whatsapp_recalc_engagement ON public.whatsapp_messages;

CREATE TRIGGER trg_whatsapp_update_lead_last_contacted
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
WHEN (NEW.direction = 'outbound' AND NEW.status IN ('sent', 'delivered', 'read', 'dry_run'))
EXECUTE FUNCTION public.update_lead_last_contacted();

CREATE TRIGGER trg_whatsapp_update_lead_first_contacted
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
WHEN (NEW.direction = 'outbound' AND NEW.status IN ('sent', 'delivered', 'read', 'dry_run'))
EXECUTE FUNCTION public.update_lead_first_contacted();

CREATE TRIGGER trg_whatsapp_handle_inbound
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
WHEN (NEW.direction IN ('inbound', 'outbound'))
EXECUTE FUNCTION public.handle_inbound_whatsapp();

CREATE TRIGGER trg_whatsapp_handle_manual_outbound
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
WHEN (NEW.direction = 'outbound')
EXECUTE FUNCTION public.handle_manual_outbound();

CREATE TRIGGER trg_whatsapp_recalc_engagement
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.recalc_whatsapp_engagement_score();