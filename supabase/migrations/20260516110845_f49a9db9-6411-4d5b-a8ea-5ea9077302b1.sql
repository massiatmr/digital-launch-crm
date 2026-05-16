
CREATE TABLE public.meta_oauth_pending (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  workspace_id uuid,
  user_token text NOT NULL,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  wa_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.meta_oauth_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads pending oauth" ON public.meta_oauth_pending
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner inserts pending oauth" ON public.meta_oauth_pending
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner updates pending oauth" ON public.meta_oauth_pending
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner deletes pending oauth" ON public.meta_oauth_pending
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Service role manages pending oauth" ON public.meta_oauth_pending
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX meta_oauth_pending_owner_idx ON public.meta_oauth_pending(owner_id, created_at DESC);
