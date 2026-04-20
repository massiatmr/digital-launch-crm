-- Colonnes media pour messages WhatsApp (vocaux + transcription)
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Bucket privé pour les audios WhatsApp (in & out)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-audio', 'wa-audio', false)
ON CONFLICT (id) DO NOTHING;

-- RLS storage : utilisateurs authentifiés peuvent lire/écrire (signed URLs côté app)
DROP POLICY IF EXISTS "wa-audio read auth" ON storage.objects;
CREATE POLICY "wa-audio read auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'wa-audio');

DROP POLICY IF EXISTS "wa-audio write auth" ON storage.objects;
CREATE POLICY "wa-audio write auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'wa-audio');