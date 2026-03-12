
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'ghost';

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_name text DEFAULT '';
