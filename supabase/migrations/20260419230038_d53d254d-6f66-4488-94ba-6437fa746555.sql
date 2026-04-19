ALTER TABLE public.owner_profiles 
ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT jsonb_build_object(
  'email_new_lead', true,
  'email_new_booking', true,
  'email_signature_received', true,
  'push_new_lead', true,
  'push_new_message', true,
  'push_reminders', true
);

ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS notification_email text;