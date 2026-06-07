
CREATE TABLE public.user_workspace_notification_prefs (
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace_notification_prefs TO authenticated;
GRANT ALL ON public.user_workspace_notification_prefs TO service_role;

ALTER TABLE public.user_workspace_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can read own prefs"
  ON public.user_workspace_notification_prefs FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "User can insert own prefs"
  ON public.user_workspace_notification_prefs FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can update own prefs"
  ON public.user_workspace_notification_prefs FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can delete own prefs"
  ON public.user_workspace_notification_prefs FOR DELETE
  TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_user_ws_notif_prefs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_user_ws_notif_prefs
  BEFORE UPDATE ON public.user_workspace_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_ws_notif_prefs();
