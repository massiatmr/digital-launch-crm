-- Remove public exposure of workspaces business data
DROP POLICY IF EXISTS "Public can view workspaces by slug" ON public.workspaces;

-- Remove overly broad wa-audio policies (owner-scoped policies remain)
DROP POLICY IF EXISTS "wa-audio read auth" ON storage.objects;
DROP POLICY IF EXISTS "wa-audio write auth" ON storage.objects;

-- Owner-scoped UPDATE / DELETE on signed-contracts bucket
CREATE POLICY "Owner can update signed contracts"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'signed-contracts' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'signed-contracts' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner can delete signed contracts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'signed-contracts' AND (auth.uid())::text = (storage.foldername(name))[1]);