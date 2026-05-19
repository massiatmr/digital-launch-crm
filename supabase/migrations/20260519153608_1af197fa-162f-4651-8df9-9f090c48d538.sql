-- Function: merge_leads(p_source, p_target)
-- Déplace toutes les données du lead source vers le lead cible, fusionne les champs non-conflictuels,
-- puis soft-delete le lead source. Sécurité : owner du workspace ou admin.

CREATE OR REPLACE FUNCTION public.merge_leads(p_source uuid, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.leads;
  tgt public.leads;
  v_user uuid := auth.uid();
  v_can boolean := false;
  v_notes_merged text;
BEGIN
  IF p_source = p_target THEN
    RAISE EXCEPTION 'same_lead';
  END IF;

  SELECT * INTO src FROM public.leads WHERE id = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found'; END IF;
  SELECT * INTO tgt FROM public.leads WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found'; END IF;

  IF src.workspace_id IS DISTINCT FROM tgt.workspace_id THEN
    RAISE EXCEPTION 'different_workspace';
  END IF;

  -- Permission : admin, owner du workspace, ou owner direct des deux leads
  IF has_role(v_user, 'admin'::app_role) THEN
    v_can := true;
  ELSIF src.workspace_id IS NOT NULL AND is_workspace_owner(src.workspace_id, v_user) THEN
    v_can := true;
  ELSIF src.owner_id = v_user AND tgt.owner_id = v_user THEN
    v_can := true;
  END IF;
  IF NOT v_can THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- 1) Tables avec FK lead_id : on déplace
  UPDATE public.whatsapp_messages           SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.whatsapp_calls              SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_activities             SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_qualification          SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.generated_messages          SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.sales_scripts               SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.reminders                   SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.bookings                    SET lead_id = p_target WHERE lead_id = p_source;

  -- Tâches de relance : on déplace en évitant doublon de step_order
  -- On annule celles qui dupliquent un step_order déjà présent sur la cible (status pending/scheduled)
  UPDATE public.lead_followup_tasks t
  SET status = 'cancelled', updated_at = now()
  WHERE t.lead_id = p_source
    AND t.status IN ('pending','scheduled')
    AND EXISTS (
      SELECT 1 FROM public.lead_followup_tasks t2
      WHERE t2.lead_id = p_target
        AND t2.status IN ('pending','scheduled','sent','executed')
        AND t2.step_order = t.step_order
    );
  UPDATE public.lead_followup_tasks SET lead_id = p_target WHERE lead_id = p_source;

  -- Labels : merge sans dup (PK = (lead_id, label_id))
  INSERT INTO public.conversation_label_assignments (lead_id, label_id, assigned_by, created_at)
  SELECT p_target, a.label_id, a.assigned_by, a.created_at
  FROM public.conversation_label_assignments a
  WHERE a.lead_id = p_source
  ON CONFLICT DO NOTHING;
  DELETE FROM public.conversation_label_assignments WHERE lead_id = p_source;

  -- Conversation state : PK = lead_id. Si la cible n'en a pas, on déplace; sinon on supprime la source.
  IF NOT EXISTS (SELECT 1 FROM public.lead_conversation_state WHERE lead_id = p_target) THEN
    UPDATE public.lead_conversation_state SET lead_id = p_target WHERE lead_id = p_source;
  ELSE
    DELETE FROM public.lead_conversation_state WHERE lead_id = p_source;
  END IF;

  -- 2) Fusion des champs : on remplit la cible avec les valeurs source si la cible est vide
  v_notes_merged := COALESCE(NULLIF(tgt.notes, ''), '') ||
    CASE WHEN COALESCE(src.notes,'') <> '' THEN
      E'\n\n---\n📎 Fusionné depuis lead ' || src.id::text || ' (' || COALESCE(src.name,'') || ')\n' || src.notes
    ELSE '' END;

  UPDATE public.leads SET
    email           = COALESCE(NULLIF(tgt.email,''),           src.email),
    phone           = COALESCE(NULLIF(tgt.phone,''),           src.phone),
    company_name    = COALESCE(NULLIF(tgt.company_name,''),    src.company_name),
    message         = COALESCE(NULLIF(tgt.message,''),         src.message),
    offer_id        = COALESCE(tgt.offer_id,                   src.offer_id),
    meta_page_id    = COALESCE(tgt.meta_page_id,               src.meta_page_id),
    meta_form_id    = COALESCE(tgt.meta_form_id,               src.meta_form_id),
    meta_ad_id      = COALESCE(tgt.meta_ad_id,                 src.meta_ad_id),
    meta_adset_id   = COALESCE(tgt.meta_adset_id,              src.meta_adset_id),
    meta_campaign_id= COALESCE(tgt.meta_campaign_id,           src.meta_campaign_id),
    notes           = v_notes_merged,
    last_contacted_at = GREATEST(COALESCE(tgt.last_contacted_at, 'epoch'::timestamptz), COALESCE(src.last_contacted_at, 'epoch'::timestamptz)),
    first_contacted_at = LEAST(COALESCE(tgt.first_contacted_at, src.first_contacted_at, now()), COALESCE(src.first_contacted_at, tgt.first_contacted_at, now())),
    updated_at      = now()
  WHERE id = p_target;

  -- 3) Soft-delete du lead source
  UPDATE public.leads SET deleted_at = now(), updated_at = now() WHERE id = p_source;

  RETURN jsonb_build_object(
    'success', true,
    'target_id', p_target,
    'source_id', p_source
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid) TO authenticated;