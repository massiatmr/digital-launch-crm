
-- Step 1: Add owner_id as nullable with default
ALTER TABLE public.leads ADD COLUMN owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.generated_messages ADD COLUMN owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.reminders ADD COLUMN owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.sales_scripts ADD COLUMN owner_id UUID DEFAULT auth.uid();

-- Step 2: Backfill existing rows with the first user
UPDATE public.leads SET owner_id = '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b' WHERE owner_id IS NULL;
UPDATE public.generated_messages SET owner_id = '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b' WHERE owner_id IS NULL;
UPDATE public.reminders SET owner_id = '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b' WHERE owner_id IS NULL;
UPDATE public.sales_scripts SET owner_id = '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b' WHERE owner_id IS NULL;

-- Step 3: Make NOT NULL
ALTER TABLE public.leads ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.generated_messages ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.reminders ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.sales_scripts ALTER COLUMN owner_id SET NOT NULL;

-- Step 4: Drop old permissive policies
DROP POLICY "Authenticated users can select leads" ON public.leads;
DROP POLICY "Authenticated users can insert leads" ON public.leads;
DROP POLICY "Authenticated users can update leads" ON public.leads;
DROP POLICY "Authenticated users can delete leads" ON public.leads;

DROP POLICY "Authenticated users can select generated_messages" ON public.generated_messages;
DROP POLICY "Authenticated users can insert generated_messages" ON public.generated_messages;
DROP POLICY "Authenticated users can update generated_messages" ON public.generated_messages;
DROP POLICY "Authenticated users can delete generated_messages" ON public.generated_messages;

DROP POLICY "Authenticated users can select reminders" ON public.reminders;
DROP POLICY "Authenticated users can insert reminders" ON public.reminders;
DROP POLICY "Authenticated users can update reminders" ON public.reminders;
DROP POLICY "Authenticated users can delete reminders" ON public.reminders;

DROP POLICY "Authenticated users can select sales_scripts" ON public.sales_scripts;
DROP POLICY "Authenticated users can insert sales_scripts" ON public.sales_scripts;
DROP POLICY "Authenticated users can update sales_scripts" ON public.sales_scripts;
DROP POLICY "Authenticated users can delete sales_scripts" ON public.sales_scripts;

-- Step 5: Create ownership-scoped policies
CREATE POLICY "Owner can select leads" ON public.leads FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update leads" ON public.leads FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete leads" ON public.leads FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Owner can select generated_messages" ON public.generated_messages FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert generated_messages" ON public.generated_messages FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update generated_messages" ON public.generated_messages FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete generated_messages" ON public.generated_messages FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Owner can select reminders" ON public.reminders FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update reminders" ON public.reminders FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete reminders" ON public.reminders FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Owner can select sales_scripts" ON public.sales_scripts FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert sales_scripts" ON public.sales_scripts FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update sales_scripts" ON public.sales_scripts FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete sales_scripts" ON public.sales_scripts FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Step 6: Indexes
CREATE INDEX idx_leads_owner_id ON public.leads(owner_id);
CREATE INDEX idx_generated_messages_owner_id ON public.generated_messages(owner_id);
CREATE INDEX idx_reminders_owner_id ON public.reminders(owner_id);
CREATE INDEX idx_sales_scripts_owner_id ON public.sales_scripts(owner_id);
