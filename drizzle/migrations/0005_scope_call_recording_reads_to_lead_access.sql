ALTER POLICY "call rec read" ON storage.objects
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND EXISTS (
    SELECT 1
    FROM public.leads AS l
    WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        (l.workspace_id IS NULL AND l.owner_id = (SELECT auth.uid()))
        OR (l.workspace_id IS NOT NULL AND public.is_workspace_member(l.workspace_id, (SELECT auth.uid())))
        OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      )
  )
);
COMMENT ON POLICY "call rec read" ON storage.objects IS 'Read access follows the lead identified by the storage object path, with explicit caller-scoped personal ownership, workspace membership, or admin authorization. Object name must stay qualified to avoid binding to leads.name.';