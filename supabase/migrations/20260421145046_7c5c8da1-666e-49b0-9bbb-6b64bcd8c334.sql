-- Backfill workspace_id on transverse tables via leads.workspace_id
UPDATE public.reminders r SET workspace_id = l.workspace_id
  FROM public.leads l WHERE r.lead_id = l.id AND r.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.sales_scripts s SET workspace_id = l.workspace_id
  FROM public.leads l WHERE s.lead_id = l.id AND s.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.generated_messages g SET workspace_id = l.workspace_id
  FROM public.leads l WHERE g.lead_id = l.id AND g.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.lead_activities a SET workspace_id = l.workspace_id
  FROM public.leads l WHERE a.lead_id = l.id AND a.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.lead_followup_tasks t SET workspace_id = l.workspace_id
  FROM public.leads l WHERE t.lead_id = l.id AND t.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.lead_qualification q SET workspace_id = l.workspace_id
  FROM public.leads l WHERE q.lead_id = l.id AND q.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

UPDATE public.lead_conversation_state cs SET workspace_id = l.workspace_id
  FROM public.leads l WHERE cs.lead_id = l.id AND cs.workspace_id IS NULL AND l.workspace_id IS NOT NULL;

-- Backfill via clients.workspace_id
UPDATE public.client_activities ca SET workspace_id = c.workspace_id
  FROM public.clients c WHERE ca.client_id = c.id AND ca.workspace_id IS NULL AND c.workspace_id IS NOT NULL;

UPDATE public.client_resources cr SET workspace_id = c.workspace_id
  FROM public.clients c WHERE cr.client_id = c.id AND cr.workspace_id IS NULL AND c.workspace_id IS NOT NULL;