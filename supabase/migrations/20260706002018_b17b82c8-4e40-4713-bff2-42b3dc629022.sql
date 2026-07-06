
ALTER TABLE public.followup_sequence_steps
  ADD COLUMN IF NOT EXISTS sequence_kind text NOT NULL DEFAULT 'qualification';

ALTER TABLE public.followup_sequence_steps
  DROP CONSTRAINT IF EXISTS followup_sequence_steps_sequence_kind_check;

ALTER TABLE public.followup_sequence_steps
  ADD CONSTRAINT followup_sequence_steps_sequence_kind_check
  CHECK (sequence_kind IN ('qualification', 'website_booking'));

CREATE INDEX IF NOT EXISTS followup_sequence_steps_kind_offer_idx
  ON public.followup_sequence_steps (workspace_id, sequence_kind, offer_id, step_order);
