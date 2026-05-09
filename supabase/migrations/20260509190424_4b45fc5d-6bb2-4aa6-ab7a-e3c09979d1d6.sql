
CREATE TABLE IF NOT EXISTS public.availability_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  working_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  morning_slot text NOT NULL DEFAULT '11:30',
  afternoon_slot text NOT NULL DEFAULT '14:30',
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select availability_settings" ON public.availability_settings
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner insert availability_settings" ON public.availability_settings
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner update availability_settings" ON public.availability_settings
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER trg_availability_settings_updated_at
  BEFORE UPDATE ON public.availability_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.availability_blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  blackout_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, blackout_date)
);

ALTER TABLE public.availability_blackouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select blackouts" ON public.availability_blackouts
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner insert blackouts" ON public.availability_blackouts
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner delete blackouts" ON public.availability_blackouts
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_blackouts_owner_date ON public.availability_blackouts(owner_id, blackout_date);
