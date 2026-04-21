-- Toggle prix + image hero
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS show_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- Table de chat IA pour l'édition d'offre
CREATE TABLE IF NOT EXISTS public.offer_ai_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_ai_chats_offer ON public.offer_ai_chats(offer_id, created_at);

ALTER TABLE public.offer_ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view offer chats"
  ON public.offer_ai_chats FOR SELECT
  USING (
    workspace_id IS NULL AND owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace members can insert offer chats"
  ON public.offer_ai_chats FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      workspace_id IS NULL
      OR public.is_workspace_member(workspace_id, auth.uid())
    )
  );

CREATE POLICY "Workspace members can delete offer chats"
  ON public.offer_ai_chats FOR DELETE
  USING (
    workspace_id IS NULL AND owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );