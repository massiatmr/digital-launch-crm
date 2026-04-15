
-- Make client-resources bucket private
UPDATE storage.buckets SET public = false WHERE id = 'client-resources';

-- Drop existing overly permissive storage policies on client-resources
DROP POLICY IF EXISTS "Allow public read client-resources" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read client-resources" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload client-resources" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read client-resources" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload client-resources" ON storage.objects;

-- Recreate scoped policies for authenticated users only
CREATE POLICY "Owner can read own client-resources"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner can upload own client-resources"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner can delete own client-resources"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-resources' AND auth.uid()::text = (storage.foldername(name))[1]);
