
-- Add first_contacted_at column
ALTER TABLE public.leads ADD COLUMN first_contacted_at timestamp with time zone DEFAULT NULL;

-- Backfill from existing lead_activities (earliest activity per lead)
UPDATE public.leads l
SET first_contacted_at = sub.first_at
FROM (
  SELECT lead_id, MIN(created_at) AS first_at
  FROM public.lead_activities
  GROUP BY lead_id
) sub
WHERE l.id = sub.lead_id;

-- Create trigger to set first_contacted_at only once
CREATE OR REPLACE FUNCTION public.update_lead_first_contacted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.leads
  SET first_contacted_at = NEW.created_at
  WHERE id = NEW.lead_id
    AND first_contacted_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lead_first_contacted
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_first_contacted();
