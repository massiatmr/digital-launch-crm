CREATE TABLE public.offer_booking_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  type public.booking_email_type NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, type)
);

ALTER TABLE public.offer_booking_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select offer_booking_email_templates"
  ON public.offer_booking_email_templates FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can insert offer_booking_email_templates"
  ON public.offer_booking_email_templates FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (workspace_id IS NULL OR is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "Workspace can update offer_booking_email_templates"
  ON public.offer_booking_email_templates FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace can delete offer_booking_email_templates"
  ON public.offer_booking_email_templates FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_offer_booking_email_templates_updated
  BEFORE UPDATE ON public.offer_booking_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS booking_admin_reminders_enabled boolean NOT NULL DEFAULT true;