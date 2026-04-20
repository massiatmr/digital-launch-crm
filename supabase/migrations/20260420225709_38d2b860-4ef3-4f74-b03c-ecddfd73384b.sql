-- Bucket public pour les logos de workspaces
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-logos', 'workspace-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Lecture publique
CREATE POLICY "workspace_logos_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'workspace-logos');

-- Upload : authentifié, le 1er segment du chemin doit être un workspace_id dont l'user est owner OU admin
CREATE POLICY "workspace_logos_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workspace-logos'
  AND (
    public.is_workspace_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "workspace_logos_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'workspace-logos'
  AND (
    public.is_workspace_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "workspace_logos_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'workspace-logos'
  AND (
    public.is_workspace_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);