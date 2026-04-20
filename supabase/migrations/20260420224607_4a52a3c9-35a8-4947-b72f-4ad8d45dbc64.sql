-- 1. Drop the overly broad public-by-slug policy on owner_profiles (exposes emails publicly).
DROP POLICY IF EXISTS "Public can view profiles by slug" ON public.owner_profiles;

-- 2. Restrict wa-audio bucket: SELECT/INSERT only by the owner whose UUID matches the first folder segment.
DROP POLICY IF EXISTS "wa_audio_select" ON storage.objects;
DROP POLICY IF EXISTS "wa_audio_insert" ON storage.objects;
DROP POLICY IF EXISTS "wa_audio_update" ON storage.objects;
DROP POLICY IF EXISTS "wa_audio_delete" ON storage.objects;
DROP POLICY IF EXISTS "wa-audio select" ON storage.objects;
DROP POLICY IF EXISTS "wa-audio insert" ON storage.objects;

-- Service role keeps full access implicitly; authenticated users only access files under inbound/<their uid>/...
CREATE POLICY "wa_audio_owner_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'wa-audio'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (
      (storage.foldername(name))[1] = 'inbound'
      AND auth.uid()::text = (storage.foldername(name))[2]
    )
  )
);

CREATE POLICY "wa_audio_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wa-audio'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (
      (storage.foldername(name))[1] = 'inbound'
      AND auth.uid()::text = (storage.foldername(name))[2]
    )
  )
);

-- 3. Make public buckets non-listable by anon (only direct file access via known path).
DROP POLICY IF EXISTS "Public can list email-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can list offer-assets" ON storage.objects;
-- Replace any broad SELECT-all policies with no anonymous listing; authenticated users keep access through other policies.
-- We don't drop existing public read policies since direct URL access is needed for public assets;
-- but if a "list all" policy exists, it should be tightened. (No-op if not present.)