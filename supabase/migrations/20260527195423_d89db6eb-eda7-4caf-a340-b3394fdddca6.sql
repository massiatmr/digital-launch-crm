
-- 1) Workspace config table
CREATE TABLE public.workspace_booking_wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  type public.booking_email_type NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'fr',
  variables_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_booking_wa_templates TO authenticated;
GRANT ALL ON public.workspace_booking_wa_templates TO service_role;

ALTER TABLE public.workspace_booking_wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members select wa booking tpl" ON public.workspace_booking_wa_templates
  FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "ws members insert wa booking tpl" ON public.workspace_booking_wa_templates
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "ws members update wa booking tpl" ON public.workspace_booking_wa_templates
  FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "ws members delete wa booking tpl" ON public.workspace_booking_wa_templates
  FOR DELETE TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER wbwt_updated_at BEFORE UPDATE ON public.workspace_booking_wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Booking WA reminders queue
CREATE TABLE public.booking_wa_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  type public.booking_email_type NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bwa_rem_status_sched ON public.booking_wa_reminders(status, scheduled_at);
CREATE INDEX idx_bwa_rem_booking ON public.booking_wa_reminders(booking_id);

GRANT SELECT ON public.booking_wa_reminders TO authenticated;
GRANT ALL ON public.booking_wa_reminders TO service_role;

ALTER TABLE public.booking_wa_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select bwa reminders" ON public.booking_wa_reminders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_wa_reminders.booking_id
      AND (b.owner_id = auth.uid()
        OR (b.workspace_id IS NOT NULL AND is_workspace_member(b.workspace_id, auth.uid()))
        OR has_role(auth.uid(),'admin'::app_role))
  ));
