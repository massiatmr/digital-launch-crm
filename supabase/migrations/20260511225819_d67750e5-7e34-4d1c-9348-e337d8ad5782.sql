
-- Table de config Meta CAPI par workspace
CREATE TABLE public.meta_capi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dataset_id text NOT NULL,
  access_token text NOT NULL,
  test_event_code text,
  enabled boolean NOT NULL DEFAULT true,
  send_qualified boolean NOT NULL DEFAULT true,
  send_won boolean NOT NULL DEFAULT true,
  send_booking boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_capi_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view meta capi config"
ON public.meta_capi_configs FOR SELECT
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners can insert meta capi config"
ON public.meta_capi_configs FOR INSERT
WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners can update meta capi config"
ON public.meta_capi_configs FOR UPDATE
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners can delete meta capi config"
ON public.meta_capi_configs FOR DELETE
USING (public.is_workspace_owner(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_meta_capi_updated_at
BEFORE UPDATE ON public.meta_capi_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fonction utilitaire pour appeler l'edge function via pg_net
CREATE OR REPLACE FUNCTION public.send_meta_capi_event(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_event_name text,
  p_booking_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.meta_capi_configs;
  fn_url text;
  service_key text;
BEGIN
  SELECT * INTO cfg FROM public.meta_capi_configs WHERE workspace_id = p_workspace_id;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE THEN RETURN; END IF;

  fn_url := 'https://rvangzupebrajhhhvewu.supabase.co/functions/v1/meta-capi-send';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'workspace_id', p_workspace_id,
      'lead_id', p_lead_id,
      'event_name', p_event_name,
      'booking_id', p_booking_id
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'meta capi dispatch failed: %', SQLERRM;
END;
$$;

-- Trigger sur lead status
CREATE OR REPLACE FUNCTION public.trg_meta_capi_lead_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.meta_capi_configs;
BEGIN
  IF NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT * INTO cfg FROM public.meta_capi_configs WHERE workspace_id = NEW.workspace_id;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE THEN RETURN NEW; END IF;

  IF cfg.send_qualified AND NEW.status IN ('qualified', 'contacted') AND OLD.status NOT IN ('qualified', 'contacted', 'won', 'signe') THEN
    PERFORM public.send_meta_capi_event(NEW.workspace_id, NEW.id, 'QualifiedLead', NULL);
  END IF;

  IF cfg.send_won AND NEW.status IN ('won', 'signe') AND OLD.status NOT IN ('won', 'signe') THEN
    PERFORM public.send_meta_capi_event(NEW.workspace_id, NEW.id, 'Purchase', NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_meta_capi ON public.leads;
CREATE TRIGGER trg_leads_meta_capi
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_lead_status();

-- Trigger sur bookings (Schedule)
CREATE OR REPLACE FUNCTION public.trg_meta_capi_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.meta_capi_configs;
  v_workspace uuid;
  v_lead uuid;
BEGIN
  v_workspace := NEW.workspace_id;
  v_lead := NEW.lead_id;
  IF v_workspace IS NULL OR v_lead IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO cfg FROM public.meta_capi_configs WHERE workspace_id = v_workspace;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE OR cfg.send_booking IS NOT TRUE THEN RETURN NEW; END IF;

  PERFORM public.send_meta_capi_event(v_workspace, v_lead, 'Schedule', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_meta_capi ON public.bookings;
CREATE TRIGGER trg_bookings_meta_capi
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_booking();
