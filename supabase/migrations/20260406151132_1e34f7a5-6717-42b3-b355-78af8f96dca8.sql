
-- Create client status enum
CREATE TYPE public.client_status AS ENUM (
  'nouveau', 'signe', 'onboarding_envoye', 'onboarding_complete',
  'en_preparation', 'en_cours', 'actif'
);

-- Create onboarding form type enum
CREATE TYPE public.onboarding_form_type AS ENUM ('website', 'ads');

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  website TEXT DEFAULT '',
  status public.client_status NOT NULL DEFAULT 'nouveau',
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  technical_accesses JSONB DEFAULT '[]'::jsonb,
  objectives JSONB DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select clients" ON public.clients FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update clients" ON public.clients FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete clients" ON public.clients FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client onboarding responses
CREATE TABLE public.client_onboarding_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  form_type public.onboarding_form_type NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed BOOLEAN NOT NULL DEFAULT false,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, form_type)
);

ALTER TABLE public.client_onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select onboarding" ON public.client_onboarding_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = client_onboarding_responses.client_id AND clients.owner_id = auth.uid()));
CREATE POLICY "Owner can insert onboarding" ON public.client_onboarding_responses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = client_onboarding_responses.client_id AND clients.owner_id = auth.uid()));
CREATE POLICY "Owner can update onboarding" ON public.client_onboarding_responses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = client_onboarding_responses.client_id AND clients.owner_id = auth.uid()));

CREATE POLICY "Anon can select onboarding by token" ON public.client_onboarding_responses FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update onboarding by token" ON public.client_onboarding_responses FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE TRIGGER update_onboarding_updated_at BEFORE UPDATE ON public.client_onboarding_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client resources
CREATE TABLE public.client_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'file',
  url TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select resources" ON public.client_resources FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert resources" ON public.client_resources FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can delete resources" ON public.client_resources FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Anon can insert resources" ON public.client_resources FOR INSERT TO anon WITH CHECK (true);

-- Client activities/history
CREATE TABLE public.client_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  action TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select activities" ON public.client_activities FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert activities" ON public.client_activities FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Storage bucket for client files
INSERT INTO storage.buckets (id, name, public) VALUES ('client-resources', 'client-resources', true);

CREATE POLICY "Auth users can upload client resources" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-resources');
CREATE POLICY "Auth users can view client resources" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'client-resources');
CREATE POLICY "Auth users can delete client resources" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'client-resources');
CREATE POLICY "Anon can upload to client resources" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'client-resources');
CREATE POLICY "Anon can view client resources" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'client-resources');
