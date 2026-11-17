ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(workspace_id, assigned_to);
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS receives_leads boolean NOT NULL DEFAULT true;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS lead_assignment_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_assigned_user_id uuid;

CREATE OR REPLACE FUNCTION public.assign_lead_round_robin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws record; nxt uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL OR NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  SELECT id, lead_assignment_mode, last_assigned_user_id INTO ws FROM public.workspaces WHERE id = NEW.workspace_id FOR UPDATE;
  IF ws.id IS NULL OR ws.lead_assignment_mode <> 'round_robin' THEN RETURN NEW; END IF;
  WITH elig AS (
    SELECT user_id, row_number() OVER (ORDER BY created_at, user_id) rn
    FROM public.workspace_members WHERE workspace_id = NEW.workspace_id AND receives_leads
  ), cur AS (SELECT rn FROM elig WHERE user_id = ws.last_assigned_user_id)
  SELECT e.user_id INTO nxt FROM elig e
  ORDER BY (e.rn <= COALESCE((SELECT rn FROM cur), 0)), e.rn LIMIT 1;
  IF nxt IS NOT NULL THEN
    NEW.assigned_to := nxt;
    UPDATE public.workspaces SET last_assigned_user_id = nxt WHERE id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_lead_round_robin ON public.leads;
CREATE TRIGGER trg_assign_lead_round_robin BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.assign_lead_round_robin();

CREATE OR REPLACE FUNCTION public.list_workspace_sales_reps(_workspace_id uuid)
RETURNS TABLE(user_id uuid, email text, role workspace_role, receives_leads boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_workspace_member(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT wm.user_id, u.email::text, wm.role, wm.receives_leads
  FROM public.workspace_members wm JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id ORDER BY wm.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.set_member_receives_leads(_workspace_id uuid, _user_id uuid, _value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_workspace_owner(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.workspace_members SET receives_leads = _value WHERE workspace_id = _workspace_id AND user_id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_lead_assignment_mode(_workspace_id uuid, _mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _mode NOT IN ('manual','round_robin') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF NOT (is_workspace_owner(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.workspaces SET lead_assignment_mode = _mode WHERE id = _workspace_id;
END $$;

REVOKE ALL ON FUNCTION public.list_workspace_sales_reps(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_receives_leads(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_lead_assignment_mode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_sales_reps(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_receives_leads(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lead_assignment_mode(uuid, text) TO authenticated;