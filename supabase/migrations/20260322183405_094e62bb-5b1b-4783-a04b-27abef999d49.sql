
-- 1. Create activity_type enum
CREATE TYPE public.activity_type AS ENUM ('call', 'whatsapp', 'email', 'note', 'relance', 'meeting');

-- 2. Create lead_activities table
CREATE TABLE public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  activity_type public.activity_type NOT NULL DEFAULT 'note',
  description TEXT NOT NULL,
  lead_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Add last_contacted_at to leads
ALTER TABLE public.leads ADD COLUMN last_contacted_at TIMESTAMPTZ;

-- 4. Enable RLS
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "Owner can select lead_activities" ON public.lead_activities FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert lead_activities" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update lead_activities" ON public.lead_activities FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete lead_activities" ON public.lead_activities FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 6. Index
CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities(lead_id);
CREATE INDEX idx_lead_activities_owner_id ON public.lead_activities(owner_id);

-- 7. Trigger to auto-update last_contacted_at on leads
CREATE OR REPLACE FUNCTION public.update_lead_last_contacted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads SET last_contacted_at = NEW.created_at WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_last_contacted
AFTER INSERT ON public.lead_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_lead_last_contacted();
