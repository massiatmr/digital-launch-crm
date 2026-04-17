CREATE TABLE public.meta_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL DEFAULT '',
  page_access_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  forms JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, page_id)
);

CREATE INDEX idx_meta_pages_page_id ON public.meta_pages(page_id);

ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select meta_pages"
ON public.meta_pages FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert meta_pages"
ON public.meta_pages FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update meta_pages"
ON public.meta_pages FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete meta_pages"
ON public.meta_pages FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

CREATE TRIGGER update_meta_pages_updated_at
BEFORE UPDATE ON public.meta_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();