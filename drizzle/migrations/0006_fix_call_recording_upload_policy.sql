ALTER POLICY "call rec upload" ON storage.objects
WITH CHECK (
  bucket_id = 'call-recordings'
  AND EXISTS (
    SELECT 1 FROM public.leads AS l
    WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        (l.workspace_id IS NULL AND l.owner_id = (SELECT auth.uid()))
        OR (l.workspace_id IS NOT NULL AND public.is_workspace_member(l.workspace_id, (SELECT auth.uid())))
        OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      )
  )
);