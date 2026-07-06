ALTER TABLE public.user_workspace_notification_prefs
ADD COLUMN IF NOT EXISTS email_booking_enabled boolean NOT NULL DEFAULT true;