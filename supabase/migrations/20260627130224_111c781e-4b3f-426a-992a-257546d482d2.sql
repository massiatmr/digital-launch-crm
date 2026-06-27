CREATE OR REPLACE FUNCTION public.merge_leads(p_source uuid, p_target uuid, p_field_overrides jsonb)
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
  v_allowed text[] := ARRAY['name','email','phone','company_name','message','notes','source','offer_id','score','status','meta_campaign_id','meta_ad_id','meta_adset_id','meta_form_id','meta_page_id'];
  v_key text;
  v_val text;
  v_sql text;
  v_set_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_source = p_target THEN RAISE EXCEPTION 'same_lead'; END IF;
  SELECT * INTO src FROM public.leads WHERE id = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found'; END IF;
  SELECT * INTO tgt FROM public.leads WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found'; END IF;
  IF src.workspace_id IS DISTINCT FROM tgt.workspace_id THEN RAISE EXCEPTION 'different_workspace'; END IF;

  IF has_role(v_user, 'admin'::app_role) THEN v_can := true;
  ELSIF src.workspace_id IS NOT NULL AND is_workspace_owner(src.workspace_id, v_user) THEN v_can := true;
  ELSIF src.owner_id = v_user AND tgt.owner_id = v_user THEN v_can := true;
  END IF;
  IF NOT v_can THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- 1) Déplacement des relations
  UPDATE public.whatsapp_messages   SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.whatsapp_calls      SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_activities     SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_qualification  SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.generated_messages  SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.sales_scripts       SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.reminders           SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.bookings            SET lead_id = p_target WHERE lead_id = p_source;

  UPDATE public.lead_followup_tasks t
  SET status = 'cancelled', updated_at = now()
  WHERE t.lead_id = p_source
    AND t.status IN ('pending','scheduled')
    AND EXISTS (
      SELECT 1 FROM public.lead_followup_tasks t2
      WHERE t2.lead_id = p_target
        AND t2.status IN ('pending','scheduled','sent','processing')
        AND t2.step_order = t.step_order
    );
  UPDATE public.lead_followup_tasks SET lead_id = p_target WHERE lead_id = p_source;

  INSERT INTO public.conversation_label_assignments (lead_id, label_id, owner_id, workspace_id, created_at)
  SELECT p_target, a.label_id, a.owner_id, a.workspace_id, a.created_at
  FROM public.conversation_label_assignments a
  WHERE a.lead_id = p_source
  ON CONFLICT DO NOTHING;
  DELETE FROM public.conversation_label_assignments WHERE lead_id = p_source;

  IF NOT EXISTS (SELECT 1 FROM public.lead_conversation_state WHERE lead_id = p_target) THEN
    UPDATE public.lead_conversation_state SET lead_id = p_target WHERE lead_id = p_source;
  ELSE
    DELETE FROM public.lead_conversation_state WHERE lead_id = p_source;
  END IF;

  -- 2a) Si pas d'overrides explicites → fallback "remplir si vide" + merge notes
  IF p_field_overrides IS NULL OR p_field_overrides = '{}'::jsonb THEN
    v_notes_merged := COALESCE(NULLIF(tgt.notes,''), '') ||
      CASE WHEN COALESCE(src.notes,'') <> '' THEN
        E'\n\n---\n📎 Fusionné depuis lead ' || src.id::text || ' (' || COALESCE(src.name,'') || E')\n' || src.notes
      ELSE '' END;

    UPDATE public.leads SET
      email = COALESCE(NULLIF(tgt.email,''), src.email),
      phone = COALESCE(NULLIF(tgt.phone,''), src.phone),
      company_name = COALESCE(NULLIF(tgt.company_name,''), src.company_name),
      message = COALESCE(NULLIF(tgt.message,''), src.message),
      offer_id = COALESCE(tgt.offer_id, src.offer_id),
      meta_page_id = COALESCE(tgt.meta_page_id, src.meta_page_id),
      meta_form_id = COALESCE(tgt.meta_form_id, src.meta_form_id),
      meta_ad_id = COALESCE(tgt.meta_ad_id, src.meta_ad_id),
      meta_adset_id = COALESCE(tgt.meta_adset_id, src.meta_adset_id),
      meta_campaign_id = COALESCE(tgt.meta_campaign_id, src.meta_campaign_id),
      notes = v_notes_merged,
      last_contacted_at = GREATEST(COALESCE(tgt.last_contacted_at,'epoch'::timestamptz), COALESCE(src.last_contacted_at,'epoch'::timestamptz)),
      first_contacted_at = LEAST(COALESCE(tgt.first_contacted_at, src.first_contacted_at, now()), COALESCE(src.first_contacted_at, tgt.first_contacted_at, now())),
      updated_at = now()
    WHERE id = p_target;
  ELSE
    -- 2b) Override explicite champ par champ (uniquement whitelist)
    FOR v_key IN SELECT jsonb_object_keys(p_field_overrides) LOOP
      IF NOT (v_key = ANY(v_allowed)) THEN CONTINUE; END IF;
      v_val := p_field_overrides ->> v_key;
      IF v_key IN ('offer_id') THEN
        IF v_val IS NULL OR v_val = '' THEN
          v_set_parts := v_set_parts || format('%I = NULL', v_key);
        ELSE
          v_set_parts := v_set_parts || format('%I = %L::uuid', v_key, v_val);
        END IF;
      ELSIF v_key = 'source' THEN
        v_set_parts := v_set_parts || format('%I = %L::lead_source', v_key, v_val);
      ELSIF v_key = 'score' THEN
        v_set_parts := v_set_parts || format('%I = %L::lead_score', v_key, v_val);
      ELSIF v_key = 'status' THEN
        v_set_parts := v_set_parts || format('%I = %L::lead_status', v_key, v_val);
      ELSE
        v_set_parts := v_set_parts || format('%I = %L', v_key, COALESCE(v_val,''));
      END IF;
    END LOOP;

    v_set_parts := v_set_parts || 'updated_at = now()';
    v_set_parts := v_set_parts || format(
      'last_contacted_at = GREATEST(COALESCE(last_contacted_at,%L::timestamptz), %L::timestamptz)',
      'epoch', COALESCE(src.last_contacted_at, 'epoch'::timestamptz)
    );

    v_sql := 'UPDATE public.leads SET ' || array_to_string(v_set_parts, ', ') || ' WHERE id = ' || quote_literal(p_target) || '::uuid';
    EXECUTE v_sql;
  END IF;

  -- 3) Soft-delete source
  UPDATE public.leads SET deleted_at = now(), updated_at = now() WHERE id = p_source;

  RETURN jsonb_build_object('success', true, 'target_id', p_target, 'source_id', p_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_leads(p_source uuid, p_target uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.merge_leads(p_source, p_target, '{}'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid) TO authenticated;