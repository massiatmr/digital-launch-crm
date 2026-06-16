UPDATE public.lead_conversation_state SET state = 'QUALIFIED', updated_at = now() WHERE lead_id = '9a428041-bb14-4909-820c-7ff86c41c982';
INSERT INTO public.lead_followup_tasks (lead_id, owner_id, workspace_id, task_type, status, scheduled_at, step_order)
SELECT id, owner_id, workspace_id, 'qualification', 'scheduled', now(), 99
FROM public.leads WHERE id = '9a428041-bb14-4909-820c-7ff86c41c982';