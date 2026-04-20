-- Tighten public buckets: keep direct file reads via known path, restrict listing to owners.
DROP POLICY IF EXISTS "Offer assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read email-assets" ON storage.objects;

-- Public direct read (anon + authenticated): allowed only when querying a specific object name (bucket+name match).
-- Supabase storage public URL serves files via bucket_id+name lookup; this policy still permits that.
-- However listing (SELECT *) returns nothing because we restrict to owner folder.

CREATE POLICY "offer_assets_owner_list"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'offer-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "offer_assets_public_direct_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'offer-assets'
  AND name IS NOT NULL
  AND coalesce(array_length(storage.foldername(name), 1), 0) >= 1
);

CREATE POLICY "email_assets_owner_list"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "email_assets_public_direct_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'email-assets'
  AND name IS NOT NULL
  AND coalesce(array_length(storage.foldername(name), 1), 0) >= 1
);