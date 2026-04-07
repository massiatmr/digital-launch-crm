
-- Create contract_signatures table
CREATE TABLE public.contract_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  contract_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_image TEXT,
  signed_at TIMESTAMPTZ,
  signer_ip TEXT,
  signer_user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  signed_pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Owner can select contract_signatures"
  ON public.contract_signatures FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert contract_signatures"
  ON public.contract_signatures FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update contract_signatures"
  ON public.contract_signatures FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete contract_signatures"
  ON public.contract_signatures FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Anon policies (for public signing page)
CREATE POLICY "Anon can select by token"
  ON public.contract_signatures FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can update by token"
  ON public.contract_signatures FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Storage bucket for signed PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('signed-contracts', 'signed-contracts', false);

-- Owner can read their signed contracts
CREATE POLICY "Owner can read signed contracts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signed-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Service role can upload signed contracts (from edge function)
CREATE POLICY "Service role can upload signed contracts"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'signed-contracts' AND auth.role() = 'service_role');
