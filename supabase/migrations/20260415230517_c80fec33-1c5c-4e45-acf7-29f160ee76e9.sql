
-- Remove old broad policies
DROP POLICY IF EXISTS "Anon can view client resources" ON storage.objects;
DROP POLICY IF EXISTS "Anon can upload to client resources" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view client resources" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload client resources" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete client resources" ON storage.objects;
