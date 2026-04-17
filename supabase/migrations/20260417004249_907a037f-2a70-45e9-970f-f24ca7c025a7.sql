-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'paid', 'overdue')),
  paid_at TIMESTAMPTZ,
  invoice_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token)
);

CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoices_owner_id ON public.invoices(owner_id);
CREATE INDEX idx_invoices_token ON public.invoices(token);
CREATE INDEX idx_invoices_status ON public.invoices(status);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Owner can select invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Anon cannot directly select (must go through edge function)
CREATE POLICY "Anon cannot select directly"
  ON public.invoices FOR SELECT TO anon
  USING (false);

-- Updated_at trigger
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-mark overdue invoices (called by client side or periodically)
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status = 'sent'
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE;
END;
$$;

-- RPC to get invoice by public token (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT to_jsonb(i.*) INTO result
  FROM public.invoices i
  WHERE i.token = p_token
  LIMIT 1;
  RETURN result;
END;
$$;