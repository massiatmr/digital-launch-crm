CREATE OR REPLACE FUNCTION public.update_client_onboarding_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    UPDATE public.clients
    SET status = 'onboarding_complete',
        updated_at = now()
    WHERE id = NEW.client_id
      AND status IN ('nouveau', 'signe', 'onboarding_envoye');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_onboarding_completed
  AFTER UPDATE ON public.client_onboarding_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_onboarding_status();