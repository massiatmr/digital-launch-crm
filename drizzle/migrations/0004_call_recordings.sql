ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS call_audio_retention_days integer NOT NULL DEFAULT 90;

CREATE TABLE public.call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  storage_path text,
  mime_type text NOT NULL DEFAULT 'audio/webm',
  duration_speech_s integer NOT NULL DEFAULT 0,
  duration_total_s integer NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  language text NOT NULL DEFAULT 'darija',
  transcript text,
  summary jsonb,
  status text NOT NULL DEFAULT 'uploaded',
  error text,
  activity_id uuid,
  audio_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_recordings_lead_idx ON public.call_recordings(lead_id, created_at DESC);
CREATE INDEX call_recordings_expiry_idx ON public.call_recordings(audio_expires_at) WHERE storage_path IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recordings TO authenticated;
GRANT ALL ON public.call_recordings TO service_role;
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View recordings of visible leads" ON public.call_recordings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));
CREATE POLICY "Insert own recordings on visible leads" ON public.call_recordings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));
CREATE POLICY "Update own recordings" ON public.call_recordings FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own or owner recordings" ON public.call_recordings FOR DELETE TO authenticated
USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "call rec read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'call-recordings' AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id::text = (storage.foldername(name))[1]));
CREATE POLICY "call rec upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'call-recordings' AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id::text = (storage.foldername(name))[1]));
CREATE POLICY "call rec delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'call-recordings' AND owner = auth.uid());