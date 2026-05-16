CREATE OR REPLACE FUNCTION public.trg_meta_capi_lead_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.meta_capi_configs;
BEGIN
  IF NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT * INTO cfg FROM public.meta_capi_configs WHERE workspace_id = NEW.workspace_id;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE THEN RETURN NEW; END IF;

  IF cfg.send_qualified AND NEW.status IN ('qualified', 'contacted') AND OLD.status NOT IN ('qualified', 'contacted', 'won') THEN
    PERFORM public.send_meta_capi_event(NEW.workspace_id, NEW.id, 'QualifiedLead', NULL);
  END IF;

  IF cfg.send_won AND NEW.status = 'won' AND OLD.status <> 'won' THEN
    PERFORM public.send_meta_capi_event(NEW.workspace_id, NEW.id, 'Purchase', NULL);
  END IF;

  RETURN NEW;
END;
$function$;