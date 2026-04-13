
-- Trigger on leads: when status changes from 'new', set first_contacted_at if NULL
CREATE OR REPLACE FUNCTION public.update_lead_first_contacted_on_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'new' AND NEW.status != 'new' AND NEW.first_contacted_at IS NULL THEN
    NEW.first_contacted_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lead_first_contacted_on_status
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_first_contacted_on_status();

-- Backfill: leads that left 'new' status but have no first_contacted_at
UPDATE public.leads
SET first_contacted_at = COALESCE(
  (SELECT MIN(created_at) FROM public.lead_activities WHERE lead_id = leads.id),
  updated_at
)
WHERE status != 'new' AND first_contacted_at IS NULL;
