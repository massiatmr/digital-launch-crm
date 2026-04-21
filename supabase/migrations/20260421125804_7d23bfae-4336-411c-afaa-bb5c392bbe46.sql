CREATE OR REPLACE FUNCTION public.get_offer_branding(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'logo_url', w.logo_url,
    'company_name', w.company_name,
    'brand_color', w.brand_color
  )
  FROM offers o
  LEFT JOIN workspaces w ON w.id = o.workspace_id
  WHERE o.slug = p_slug AND o.is_active = true AND o.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_offer_branding(text) TO anon, authenticated;