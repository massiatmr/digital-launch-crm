ALTER TABLE public.availability_settings
  ADD COLUMN IF NOT EXISTS slot_interval_minutes int NOT NULL DEFAULT 60;

ALTER TABLE public.availability_settings
  DROP CONSTRAINT IF EXISTS availability_settings_slot_interval_chk;

ALTER TABLE public.availability_settings
  ADD CONSTRAINT availability_settings_slot_interval_chk
  CHECK (slot_interval_minutes IN (15, 30, 45, 60));