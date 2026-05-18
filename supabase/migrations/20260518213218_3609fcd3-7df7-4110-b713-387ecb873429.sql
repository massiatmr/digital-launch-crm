CREATE TABLE IF NOT EXISTS public.workspace_booking_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  type public.booking_email_type NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, type)
);

ALTER TABLE public.workspace_booking_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select wbet" ON public.workspace_booking_email_templates
  FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can insert wbet" ON public.workspace_booking_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace can update wbet" ON public.workspace_booking_email_templates
  FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can delete wbet" ON public.workspace_booking_email_templates
  FOR DELETE TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_wbet_updated_at
  BEFORE UPDATE ON public.workspace_booking_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
