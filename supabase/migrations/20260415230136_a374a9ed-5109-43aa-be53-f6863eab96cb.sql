
-- Drop the header-based policies and replace with false
DROP POLICY IF EXISTS "Anon can select by token" ON public.contract_signatures;
CREATE POLICY "Anon cannot select directly"
  ON public.contract_signatures FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Anon can update by token" ON public.contract_signatures;
CREATE POLICY "Anon cannot update directly"
  ON public.contract_signatures FOR UPDATE TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Anon can select onboarding by token" ON public.client_onboarding_responses;
CREATE POLICY "Anon cannot select onboarding directly"
  ON public.client_onboarding_responses FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Anon can update onboarding by token" ON public.client_onboarding_responses;
CREATE POLICY "Anon cannot update onboarding directly"
  ON public.client_onboarding_responses FOR UPDATE TO anon
  USING (false) WITH CHECK (false);

-- RPC: get onboarding by token
CREATE OR REPLACE FUNCTION public.get_onboarding_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', o.id,
    'client_id', o.client_id,
    'form_type', o.form_type,
    'responses', o.responses,
    'completed', o.completed,
    'token', o.token,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'clients', jsonb_build_object('name', c.name, 'company_name', c.company_name)
  )
  INTO result
  FROM public.client_onboarding_responses o
  JOIN public.clients c ON c.id = o.client_id
  WHERE o.token = p_token;

  IF result IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN result;
END;
$$;

-- RPC: save onboarding by token
CREATE OR REPLACE FUNCTION public.save_onboarding_by_token(
  p_token text,
  p_responses jsonb,
  p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_onboarding_responses
  SET responses = p_responses,
      completed = p_completed,
      updated_at = now()
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;

-- RPC: get contract by token (used by validate-signature edge function, not directly by client)
-- The signature page already uses the edge function, so no client-side RPC needed for contracts
