-- Bucket public pour les images d'offres générées par l'IA
INSERT INTO storage.buckets (id, name, public)
VALUES ('offer-assets', 'offer-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique
CREATE POLICY "Offer assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'offer-assets');

-- Upload par utilisateur authentifié dans son dossier
CREATE POLICY "Authenticated users can upload offer assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'offer-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own offer assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'offer-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own offer assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'offer-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);