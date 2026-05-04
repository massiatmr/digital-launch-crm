-- =========================
-- 1) Enrichissement whatsapp_messages
-- =========================
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_type        text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS reply_to_wa_id      text,
  ADD COLUMN IF NOT EXISTS reply_to_snapshot   jsonb,
  ADD COLUMN IF NOT EXISTS reactions           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS read_at             timestamptz,
  ADD COLUMN IF NOT EXISTS is_pinned           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_filename      text,
  ADD COLUMN IF NOT EXISTS media_size_bytes    bigint,
  ADD COLUMN IF NOT EXISTS media_thumbnail_path text;

-- Backfill message_type pour les messages existants
UPDATE public.whatsapp_messages
SET message_type = CASE
  WHEN media_storage_path IS NOT NULL AND COALESCE(media_type,'') LIKE 'audio%' THEN 'audio'
  WHEN media_storage_path IS NOT NULL AND COALESCE(media_type,'') LIKE 'image%' THEN 'image'
  WHEN media_storage_path IS NOT NULL AND COALESCE(media_type,'') LIKE 'video%' THEN 'video'
  WHEN media_storage_path IS NOT NULL THEN 'document'
  ELSE 'text'
END
WHERE message_type = 'text' AND media_storage_path IS NOT NULL;

-- Lookup rapide pour wa_message_id (utile pour reply / status updates)
CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_id ON public.whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Index FTS français sur content + transcript pour la recherche
CREATE INDEX IF NOT EXISTS idx_wa_messages_fts
  ON public.whatsapp_messages
  USING GIN (to_tsvector('french', coalesce(content,'') || ' ' || coalesce(transcript,'')));

-- =========================
-- 2) Table whatsapp_calls
-- =========================
CREATE TABLE IF NOT EXISTS public.whatsapp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','answered','missed','declined','ended','failed')),
  wa_call_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_calls_lead ON public.whatsapp_calls(lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_calls_workspace ON public.whatsapp_calls(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_calls_owner ON public.whatsapp_calls(owner_id);

ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace can select wa_calls" ON public.whatsapp_calls;
CREATE POLICY "Workspace can select wa_calls" ON public.whatsapp_calls
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Owner can insert wa_calls" ON public.whatsapp_calls;
CREATE POLICY "Owner can insert wa_calls" ON public.whatsapp_calls
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update wa_calls" ON public.whatsapp_calls;
CREATE POLICY "Owner can update wa_calls" ON public.whatsapp_calls
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Owner can delete wa_calls" ON public.whatsapp_calls;
CREATE POLICY "Owner can delete wa_calls" ON public.whatsapp_calls
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_wa_calls_updated_at ON public.whatsapp_calls;
CREATE TRIGGER trg_wa_calls_updated_at
  BEFORE UPDATE ON public.whatsapp_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.whatsapp_calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='whatsapp_calls';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_calls';
  END IF;
END $$;

-- =========================
-- 3) RPC de recherche FTS
-- =========================
CREATE OR REPLACE FUNCTION public.search_wa_messages(p_lead_id uuid, p_query text)
RETURNS TABLE (
  id uuid,
  content text,
  transcript text,
  sent_at timestamptz,
  direction wa_direction,
  rank real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    m.id, m.content, m.transcript, m.sent_at, m.direction,
    ts_rank(
      to_tsvector('french', coalesce(m.content,'') || ' ' || coalesce(m.transcript,'')),
      plainto_tsquery('french', p_query)
    ) AS rank
  FROM public.whatsapp_messages m
  JOIN public.leads l ON l.id = m.lead_id
  WHERE m.lead_id = p_lead_id
    AND (
      l.owner_id = auth.uid()
      OR (l.workspace_id IS NOT NULL AND public.is_workspace_member(l.workspace_id, auth.uid()))
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
    AND to_tsvector('french', coalesce(m.content,'') || ' ' || coalesce(m.transcript,''))
        @@ plainto_tsquery('french', p_query)
  ORDER BY m.sent_at DESC
  LIMIT 200;
$$;

-- =========================
-- 4) Storage bucket wa-media (privé)
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-media', 'wa-media', false)
ON CONFLICT (id) DO NOTHING;

-- Policies sur storage.objects pour wa-media
-- Lecture : owner OU membre workspace via préfixe owner_id en 1er segment du path
DROP POLICY IF EXISTS "wa_media owner read" ON storage.objects;
CREATE POLICY "wa_media owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'wa-media'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_messages wm
        WHERE wm.media_storage_path = name
          AND (
            wm.owner_id = auth.uid()
            OR (wm.workspace_id IS NOT NULL AND public.is_workspace_member(wm.workspace_id, auth.uid()))
          )
      )
    )
  );

DROP POLICY IF EXISTS "wa_media owner write" ON storage.objects;
CREATE POLICY "wa_media owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'wa-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "wa_media owner update" ON storage.objects;
CREATE POLICY "wa_media owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'wa-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "wa_media owner delete" ON storage.objects;
CREATE POLICY "wa_media owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'wa-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role peut tout faire (pour les webhooks inbound)
DROP POLICY IF EXISTS "wa_media service role all" ON storage.objects;
CREATE POLICY "wa_media service role all" ON storage.objects
  FOR ALL TO public
  USING (bucket_id = 'wa-media' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'wa-media' AND auth.role() = 'service_role');