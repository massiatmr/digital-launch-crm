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
  v_allowed text[] := ARRAY[
    'name','email','phone','company_name','message','notes','source','offer_id','score','status',
    'meta_campaign_id','meta_ad_id','meta_adset_id','meta_form_id','meta_page_id'
  ];
  v_key text;
  v_val text;
  v_sql text;
  v_set_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_source = p_target THEN
    RAISE EXCEPTION 'same_lead';
  END IF;

  SELECT * INTO src FROM public.leads WHERE id = p_source;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  SELECT * INTO tgt FROM public.leads WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

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

  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Déplacement des relations simples
  UPDATE public.whatsapp_messages SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.whatsapp_calls SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.lead_activities SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.generated_messages SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.sales_scripts SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.reminders SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.bookings SET lead_id = p_target WHERE lead_id = p_source;

  -- 2) Tâches follow-up : éviter les doublons actifs, sans statut invalide
  UPDATE public.lead_followup_tasks t
  SET status = 'cancelled'::public.followup_task_status,
      updated_at = now(),
      error_message = COALESCE(t.error_message, 'Annulée lors de la fusion : tâche équivalente déjà présente sur le lead conservé')
  WHERE t.lead_id = p_source
    AND t.status IN ('pending'::public.followup_task_status, 'scheduled'::public.followup_task_status)
    AND EXISTS (
      SELECT 1
      FROM public.lead_followup_tasks t2
      WHERE t2.lead_id = p_target
        AND t2.status IN (
          'pending'::public.followup_task_status,
          'scheduled'::public.followup_task_status,
          'sent'::public.followup_task_status,
          'processing'::public.followup_task_status
        )
        AND t2.task_type = t.task_type
        AND t2.step_order = t.step_order
    );

  UPDATE public.lead_followup_tasks
  SET lead_id = p_target,
      updated_at = now()
  WHERE lead_id = p_source;

  -- 3) Qualification IA : la table est unique par lead, donc fusionner au lieu d'UPDATE direct si besoin
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
        last_qualified_at = GREATEST(
          COALESCE(tq.last_qualified_at, 'epoch'::timestamptz),
          COALESCE(sq.last_qualified_at, 'epoch'::timestamptz)
        ),
        updated_at = now()
    FROM public.lead_qualification sq
    WHERE tq.lead_id = p_target
      AND sq.lead_id = p_source;

    DELETE FROM public.lead_qualification WHERE lead_id = p_source;
  ELSE
    UPDATE public.lead_qualification
    SET lead_id = p_target,
        updated_at = now()
    WHERE lead_id = p_source;
  END IF;

  -- 4) Labels : schema actuel uniquement (lead_id, label_id, owner_id, workspace_id, created_at)
  INSERT INTO public.conversation_label_assignments (lead_id, label_id, owner_id, workspace_id, created_at)
  SELECT p_target, a.label_id, a.owner_id, a.workspace_id, a.created_at
  FROM public.conversation_label_assignments a
  WHERE a.lead_id = p_source
  ON CONFLICT (lead_id, label_id) DO NOTHING;

  DELETE FROM public.conversation_label_assignments WHERE lead_id = p_source;

  -- 5) État conversationnel : unique par lead, conserver les dates/pauses importantes
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
    WHERE ts.lead_id = p_target
      AND ss.lead_id = p_source;

    UPDATE public.lead_conversation_state
    SET automation_paused_at = NULLIF(automation_paused_at, 'epoch'::timestamptz),
        snoozed_until = NULLIF(snoozed_until, 'epoch'::timestamptz),
        resolved_at = NULLIF(resolved_at, 'epoch'::timestamptz),
        last_inbound_at = NULLIF(last_inbound_at, 'epoch'::timestamptz),
        last_outbound_at = NULLIF(last_outbound_at, 'epoch'::timestamptz)
    WHERE lead_id = p_target;

    DELETE FROM public.lead_conversation_state WHERE lead_id = p_source;
  ELSE
    UPDATE public.lead_conversation_state
    SET lead_id = p_target,
        updated_at = now()
    WHERE lead_id = p_source;
  END IF;

  -- 6a) Pas d'override explicite : remplir les champs vides + fusionner les notes
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
    -- 6b) Overrides explicites : whitelist + array_append pour éviter l'erreur "malformed array literal"
    FOR v_key IN SELECT jsonb_object_keys(p_field_overrides) LOOP
      IF NOT (v_key = ANY(v_allowed)) THEN
        CONTINUE;
      END IF;

      v_val := p_field_overrides ->> v_key;

      IF v_key IN ('offer_id') THEN
        IF v_val IS NULL OR v_val = '' THEN
          v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
        ELSE
          v_set_parts := array_append(v_set_parts, format('%I = %L::uuid', v_key, v_val));
        END IF;
      ELSIF v_key = 'source' THEN
        IF v_val IS NULL OR v_val = '' THEN
          v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
        ELSE
          v_set_parts := array_append(v_set_parts, format('%I = %L::public.lead_source', v_key, v_val));
        END IF;
      ELSIF v_key = 'score' THEN
        IF v_val IS NULL OR v_val = '' THEN
          v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
        ELSE
          v_set_parts := array_append(v_set_parts, format('%I = %L::public.lead_score', v_key, v_val));
        END IF;
      ELSIF v_key = 'status' THEN
        IF v_val IS NULL OR v_val = '' THEN
          v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
        ELSE
          v_set_parts := array_append(v_set_parts, format('%I = %L::public.lead_status', v_key, v_val));
        END IF;
      ELSE
        IF v_val IS NULL THEN
          v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
        ELSE
          v_set_parts := array_append(v_set_parts, format('%I = %L', v_key, v_val));
        END IF;
      END IF;
    END LOOP;

    v_set_parts := array_append(v_set_parts, 'updated_at = now()');
    v_set_parts := array_append(v_set_parts, format(
      'last_contacted_at = GREATEST(COALESCE(last_contacted_at, %L::timestamptz), %L::timestamptz)',
      'epoch', COALESCE(src.last_contacted_at, 'epoch'::timestamptz)
    ));
    v_set_parts := array_append(v_set_parts, format(
      'first_contacted_at = NULLIF(LEAST(COALESCE(first_contacted_at, %L::timestamptz), %L::timestamptz), %L::timestamptz)',
      'infinity', COALESCE(src.first_contacted_at, 'infinity'::timestamptz), 'infinity'
    ));

    v_sql := 'UPDATE public.leads SET ' || array_to_string(v_set_parts, ', ') || ' WHERE id = ' || quote_literal(p_target) || '::uuid';
    EXECUTE v_sql;
  END IF;

  -- 7) Soft-delete source après réussite complète
  UPDATE public.leads
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_source;

  RETURN jsonb_build_object('success', true, 'target_id', p_target, 'source_id', p_source);
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_leads(p_source uuid, p_target uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.merge_leads(p_source, p_target, '{}'::jsonb);
$function$;