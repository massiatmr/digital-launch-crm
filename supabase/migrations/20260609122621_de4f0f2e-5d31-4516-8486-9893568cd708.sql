
UPDATE public.booking_emails SET status = 'skipped' WHERE status = 'pending';
UPDATE public.booking_wa_reminders SET status = 'skipped' WHERE status = 'pending';
