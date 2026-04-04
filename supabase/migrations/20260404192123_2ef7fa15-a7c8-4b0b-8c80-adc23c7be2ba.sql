CREATE TYPE public.show_status AS ENUM ('pending', 'show', 'noshow');
ALTER TABLE public.leads ADD COLUMN show_status show_status NOT NULL DEFAULT 'pending';