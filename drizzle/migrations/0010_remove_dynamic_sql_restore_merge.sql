CREATE OR REPLACE FUNCTION public.restore_from_snapshot(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  rec public.audit_log;
  snap jsonb;
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO rec FROM public.audit_log WHERE id = p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_not_found'; END IF;
  snap := rec.snapshot - 'deleted_at';
  CASE rec.entity_type
    WHEN 'leads' THEN
      UPDATE public.leads SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.leads SELECT * FROM jsonb_populate_record(NULL::public.leads, snap); END IF;
    WHEN 'clients' THEN
      UPDATE public.clients SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.clients SELECT * FROM jsonb_populate_record(NULL::public.clients, snap); END IF;
    WHEN 'offers' THEN
      UPDATE public.offers SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.offers SELECT * FROM jsonb_populate_record(NULL::public.offers, snap); END IF;
    WHEN 'bookings' THEN
      UPDATE public.bookings SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.bookings SELECT * FROM jsonb_populate_record(NULL::public.bookings, snap); END IF;
    WHEN 'invoices' THEN
      UPDATE public.invoices SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.invoices SELECT * FROM jsonb_populate_record(NULL::public.invoices, snap); END IF;
    WHEN 'contract_signatures' THEN
      UPDATE public.contract_signatures SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.contract_signatures SELECT * FROM jsonb_populate_record(NULL::public.contract_signatures, snap); END IF;
    WHEN 'workspaces' THEN
      UPDATE public.workspaces SET deleted_at = NULL WHERE id = rec.entity_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN INSERT INTO public.workspaces SELECT * FROM jsonb_populate_record(NULL::public.workspaces, snap); END IF;
    ELSE RAISE EXCEPTION 'unsupported_entity_type';
  END CASE;
  RETURN jsonb_build_object('success', true, 'mode', CASE WHEN n > 0 THEN 'undeleted' ELSE 'reinserted' END, 'entity_id', rec.entity_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_leads(p_source uuid, p_target uuid, p_field_overrides jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF public.has_role(v_user, 'admin'::public.app_role) THEN
    v_can := true;
  ELSIF src.workspace_id IS NOT NULL AND public.is_workspace_owner(src.workspace_id, v_user) THEN
    v_can := true;
  ELSIF src.owner_id = v_user AND tgt.owner_id = v_user THEN
    v_can := true;
  END IF;
  IF NOT v_can THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.whatsapp_messages SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.whatsapp_calls SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_activities SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.generated_messages SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.sales_scripts SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.reminders SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.bookings SET lead_id = p_target WHERE lead_id = p_source;

  UPDATE public.lead_followup_tasks t
  SET status = 'cancelled'::public.followup_task_status,
      updated_at = now(),
      error_message = COALESCE(t.error_message, 'Annulée lors de la fusion : tâche équivalente déjà présente sur le lead conservé')
  WHERE t.lead_id = p_source
    AND t.status IN ('pending'::public.followup_task_status, 'scheduled'::public.followup_task_status)
    AND EXISTS (
      SELECT 1 FROM public.lead_followup_tasks t2
      WHERE t2.lead_id = p_target
        AND t2.status IN ('pending'::public.followup_task_status,'scheduled'::public.followup_task_status,'sent'::public.followup_task_status,'processing'::public.followup_task_status)
        AND t2.task_type = t.task_type
        AND t2.step_order = t.step_order
    );

  UPDATE public.lead_followup_tasks SET lead_id = p_target, updated_at = now() WHERE lead_id = p_source;

  IF EXISTS (SELECT 1 FROM public.lead_qualification WHERE lead_id = p_source)
     AND EXISTS (SELECT 1 FROM public.lead_qualification WHERE lead_id = p_target) THEN
    UPDATE public.lead_qualification tq
    SET pain_point = COALESCE(NULLIF(tq.pain_point, ''), sq.pain_point),
        urgency = COALESCE(NULLIF(tq.urgency, ''), sq.urgency),
        budget_signal = COALESCE(NULLIF(tq.budget_signal, ''), sq.budget_signal),
        decision_maker = COALESCE(NULLIF(tq.decision_maker, ''), sq.decision_maker),
        objections = CASE
          WHEN tq.objections IS NULL OR tq.objections = '[]'::jsonb THEN sq.objections
          WHEN sq.objections IS NULL OR sq.objections = '[]'::jsonb THEN tq.objections
          ELSE tq.objections || sq.objections
        END,
        interest_level = GREATEST(COALESCE(tq.interest_level, 0), COALESCE(sq.interest_level, 0)),
        intent = COALESCE(NULLIF(tq.intent, ''), sq.intent),
        summary = CASE
          WHEN COALESCE(NULLIF(tq.summary, ''), '') = '' THEN sq.summary
          WHEN COALESCE(NULLIF(sq.summary, ''), '') = '' OR tq.summary = sq.summary THEN tq.summary
          ELSE tq.summary || E'\n\n---\nFusionné depuis le doublon :\n' || sq.summary
        END,
        last_qualified_at = GREATEST(COALESCE(tq.last_qualified_at, 'epoch'::timestamptz), COALESCE(sq.last_qualified_at, 'epoch'::timestamptz)),
        updated_at = now()
    FROM public.lead_qualification sq
    WHERE tq.lead_id = p_target AND sq.lead_id = p_source;
    DELETE FROM public.lead_qualification WHERE lead_id = p_source;
  ELSE
    UPDATE public.lead_qualification SET lead_id = p_target, updated_at = now() WHERE lead_id = p_source;
  END IF;

  INSERT INTO public.conversation_label_assignments (lead_id, label_id, owner_id, workspace_id, created_at)
  SELECT p_target, a.label_id, a.owner_id, a.workspace_id, a.created_at
  FROM public.conversation_label_assignments a
  WHERE a.lead_id = p_source
  ON CONFLICT (lead_id, label_id) DO NOTHING;
  DELETE FROM public.conversation_label_assignments WHERE lead_id = p_source;

  IF EXISTS (SELECT 1 FROM public.lead_conversation_state WHERE lead_id = p_source)
     AND EXISTS (SELECT 1 FROM public.lead_conversation_state WHERE lead_id = p_target) THEN
    UPDATE public.lead_conversation_state ts
    SET state = CASE
          WHEN ts.state IN ('BOOKED'::public.conversation_state, 'CLOSED'::public.conversation_state) THEN ts.state
          WHEN ss.state IN ('BOOKED'::public.conversation_state, 'CLOSED'::public.conversation_state) THEN ss.state
          ELSE ts.state
        END,
        last_inbound_at = GREATEST(COALESCE(ts.last_inbound_at, 'epoch'::timestamptz), COALESCE(ss.last_inbound_at, 'epoch'::timestamptz)),
        last_outbound_at = GREATEST(COALESCE(ts.last_outbound_at, 'epoch'::timestamptz), COALESCE(ss.last_outbound_at, 'epoch'::timestamptz)),
        automation_paused_at = GREATEST(COALESCE(ts.automation_paused_at, 'epoch'::timestamptz), COALESCE(ss.automation_paused_at, 'epoch'::timestamptz)),
        snoozed_until = GREATEST(COALESCE(ts.snoozed_until, 'epoch'::timestamptz), COALESCE(ss.snoozed_until, 'epoch'::timestamptz)),
        resolved_at = GREATEST(COALESCE(ts.resolved_at, 'epoch'::timestamptz), COALESCE(ss.resolved_at, 'epoch'::timestamptz)),
        workspace_id = COALESCE(ts.workspace_id, ss.workspace_id),
        updated_at = now()
    FROM public.lead_conversation_state ss
    WHERE ts.lead_id = p_target AND ss.lead_id = p_source;

    UPDATE public.lead_conversation_state
    SET automation_paused_at = NULLIF(automation_paused_at, 'epoch'::timestamptz),
        snoozed_until = NULLIF(snoozed_until, 'epoch'::timestamptz),
        resolved_at = NULLIF(resolved_at, 'epoch'::timestamptz),
        last_inbound_at = NULLIF(last_inbound_at, 'epoch'::timestamptz),
        last_outbound_at = NULLIF(last_outbound_at, 'epoch'::timestamptz)
    WHERE lead_id = p_target;
    DELETE FROM public.lead_conversation_state WHERE lead_id = p_source;
  ELSE
    UPDATE public.lead_conversation_state SET lead_id = p_target, updated_at = now() WHERE lead_id = p_source;
  END IF;

  IF p_field_overrides IS NULL OR p_field_overrides = '{}'::jsonb THEN
    v_notes_merged := COALESCE(NULLIF(tgt.notes, ''), '') ||
      CASE WHEN COALESCE(src.notes, '') <> '' THEN
        E'\n\n---\n📎 Fusionné depuis lead ' || src.id::text || ' (' || COALESCE(src.name, '') || E')\n' || src.notes
      ELSE '' END;

    UPDATE public.leads
    SET email = COALESCE(NULLIF(tgt.email, ''), src.email),
        phone = COALESCE(NULLIF(tgt.phone, ''), src.phone),
        company_name = COALESCE(NULLIF(tgt.company_name, ''), src.company_name),
        message = COALESCE(NULLIF(tgt.message, ''), src.message),
        offer_id = COALESCE(tgt.offer_id, src.offer_id),
        meta_page_id = COALESCE(tgt.meta_page_id, src.meta_page_id),
        meta_form_id = COALESCE(tgt.meta_form_id, src.meta_form_id),
        meta_ad_id = COALESCE(tgt.meta_ad_id, src.meta_ad_id),
        meta_adset_id = COALESCE(tgt.meta_adset_id, src.meta_adset_id),
        meta_campaign_id = COALESCE(tgt.meta_campaign_id, src.meta_campaign_id),
        notes = NULLIF(v_notes_merged, ''),
        last_contacted_at = GREATEST(COALESCE(tgt.last_contacted_at, 'epoch'::timestamptz), COALESCE(src.last_contacted_at, 'epoch'::timestamptz)),
        first_contacted_at = NULLIF(LEAST(COALESCE(tgt.first_contacted_at, src.first_contacted_at, 'infinity'::timestamptz), COALESCE(src.first_contacted_at, tgt.first_contacted_at, 'infinity'::timestamptz)), 'infinity'::timestamptz),
        updated_at = now()
    WHERE id = p_target;
  ELSE
    UPDATE public.leads SET
      offer_id = CASE WHEN p_field_overrides ? 'offer_id' THEN NULLIF(p_field_overrides->>'offer_id','')::uuid ELSE offer_id END,
      source = CASE WHEN p_field_overrides ? 'source' THEN NULLIF(p_field_overrides->>'source','')::public.lead_source ELSE source END,
      score = CASE WHEN p_field_overrides ? 'score' THEN NULLIF(p_field_overrides->>'score','')::public.lead_score ELSE score END,
      status = CASE WHEN p_field_overrides ? 'status' THEN NULLIF(p_field_overrides->>'status','')::public.lead_status ELSE status END,
      name = CASE WHEN p_field_overrides ? 'name' THEN (p_field_overrides->>'name') ELSE name END,
      email = CASE WHEN p_field_overrides ? 'email' THEN (p_field_overrides->>'email') ELSE email END,
      phone = CASE WHEN p_field_overrides ? 'phone' THEN (p_field_overrides->>'phone') ELSE phone END,
      company_name = CASE WHEN p_field_overrides ? 'company_name' THEN (p_field_overrides->>'company_name') ELSE company_name END,
      message = CASE WHEN p_field_overrides ? 'message' THEN (p_field_overrides->>'message') ELSE message END,
      notes = CASE WHEN p_field_overrides ? 'notes' THEN (p_field_overrides->>'notes') ELSE notes END,
      meta_campaign_id = CASE WHEN p_field_overrides ? 'meta_campaign_id' THEN (p_field_overrides->>'meta_campaign_id') ELSE meta_campaign_id END,
      meta_ad_id = CASE WHEN p_field_overrides ? 'meta_ad_id' THEN (p_field_overrides->>'meta_ad_id') ELSE meta_ad_id END,
      meta_adset_id = CASE WHEN p_field_overrides ? 'meta_adset_id' THEN (p_field_overrides->>'meta_adset_id') ELSE meta_adset_id END,
      meta_form_id = CASE WHEN p_field_overrides ? 'meta_form_id' THEN (p_field_overrides->>'meta_form_id') ELSE meta_form_id END,
      meta_page_id = CASE WHEN p_field_overrides ? 'meta_page_id' THEN (p_field_overrides->>'meta_page_id') ELSE meta_page_id END,
      last_contacted_at = GREATEST(COALESCE(last_contacted_at, 'epoch'::timestamptz), COALESCE(src.last_contacted_at, 'epoch'::timestamptz)),
      first_contacted_at = NULLIF(LEAST(COALESCE(first_contacted_at, 'infinity'::timestamptz), COALESCE(src.first_contacted_at, 'infinity'::timestamptz)), 'infinity'::timestamptz),
      updated_at = now()
    WHERE id = p_target;
  END IF;

  UPDATE public.leads SET deleted_at = now(), updated_at = now() WHERE id = p_source;

  RETURN jsonb_build_object('success', true, 'target_id', p_target, 'source_id', p_source);
END;
$function$;