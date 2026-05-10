ALTER TABLE public.availability_settings 
ADD COLUMN IF NOT EXISTS min_lead_time_hours integer NOT NULL DEFAULT 2;