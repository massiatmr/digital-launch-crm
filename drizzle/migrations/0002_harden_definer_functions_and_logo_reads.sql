REVOKE EXECUTE ON FUNCTION public.purge_soft_deleted_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_records() TO service_role;

CREATE OR REPLACE FUNCTION public.restore_from_snapshot(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  rec public.audit_log;
  exists_check BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO rec FROM public.audit_log WHERE id = p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_not_found'; END IF;
  IF rec.entity_type NOT IN ('leads','clients','offers','bookings','invoices','contract_signatures','workspaces') THEN
    RAISE EXCEPTION 'unsupported_entity_type';
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', rec.entity_type)
    USING rec.entity_id INTO exists_check;
  IF exists_check THEN
    EXECUTE format('UPDATE public.%I SET deleted_at = NULL WHERE id = $1', rec.entity_type) USING rec.entity_id;
    RETURN jsonb_build_object('success', true, 'mode', 'undeleted', 'entity_id', rec.entity_id);
  ELSE
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)', rec.entity_type, rec.entity_type)
      USING (rec.snapshot - 'deleted_at');
    RETURN jsonb_build_object('success', true, 'mode', 'reinserted', 'entity_id', rec.entity_id);
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.restore_from_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_from_snapshot(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.merge_leads(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_leads(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS workspace_logos_public_read ON storage.objects;
CREATE POLICY workspace_logos_member_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'workspace-logos'
  AND (
    public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);