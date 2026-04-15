
-- 1. Fix contract_signatures anon policies (CRITICAL)
DROP POLICY IF EXISTS "Anon can select by token" ON public.contract_signatures;
CREATE POLICY "Anon can select by token"
  ON public.contract_signatures
  FOR SELECT
  TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-contract-token');

DROP POLICY IF EXISTS "Anon can update by token" ON public.contract_signatures;
CREATE POLICY "Anon can update by token"
  ON public.contract_signatures
  FOR UPDATE
  TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-contract-token')
  WITH CHECK (token = current_setting('request.headers', true)::json->>'x-contract-token');

-- 2. Fix client_onboarding_responses anon policies (CRITICAL)
DROP POLICY IF EXISTS "Anon can select onboarding by token" ON public.client_onboarding_responses;
CREATE POLICY "Anon can select onboarding by token"
  ON public.client_onboarding_responses
  FOR SELECT
  TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-onboarding-token');

DROP POLICY IF EXISTS "Anon can update onboarding by token" ON public.client_onboarding_responses;
CREATE POLICY "Anon can update onboarding by token"
  ON public.client_onboarding_responses
  FOR UPDATE
  TO anon
  USING (token = current_setting('request.headers', true)::json->>'x-onboarding-token')
  WITH CHECK (token = current_setting('request.headers', true)::json->>'x-onboarding-token');

-- 3. Remove anon INSERT on client_resources (CRITICAL)
DROP POLICY IF EXISTS "Anon can insert resources" ON public.client_resources;

-- 4. Fix bookings anon INSERT to scope owner_id
DROP POLICY IF EXISTS "Anon can insert bookings" ON public.bookings;
CREATE POLICY "Anon can insert bookings"
  ON public.bookings
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.offers
      WHERE offers.id = bookings.offer_id
        AND offers.owner_id = bookings.owner_id
        AND offers.is_active = true
    )
  );

-- 5. Fix function search_path on pgmq wrapper functions
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
  RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;
