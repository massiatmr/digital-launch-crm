
-- Drop all existing permissive public policies
DROP POLICY IF EXISTS "Allow all access to leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all access to generated_messages" ON public.generated_messages;
DROP POLICY IF EXISTS "Allow all access to reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow all access to sales_scripts" ON public.sales_scripts;

-- leads: authenticated users only
CREATE POLICY "Authenticated users can select leads"
  ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert leads"
  ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leads"
  ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete leads"
  ON public.leads FOR DELETE TO authenticated USING (true);

-- generated_messages: authenticated users only
CREATE POLICY "Authenticated users can select generated_messages"
  ON public.generated_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert generated_messages"
  ON public.generated_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update generated_messages"
  ON public.generated_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete generated_messages"
  ON public.generated_messages FOR DELETE TO authenticated USING (true);

-- reminders: authenticated users only
CREATE POLICY "Authenticated users can select reminders"
  ON public.reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert reminders"
  ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update reminders"
  ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete reminders"
  ON public.reminders FOR DELETE TO authenticated USING (true);

-- sales_scripts: authenticated users only
CREATE POLICY "Authenticated users can select sales_scripts"
  ON public.sales_scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sales_scripts"
  ON public.sales_scripts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sales_scripts"
  ON public.sales_scripts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete sales_scripts"
  ON public.sales_scripts FOR DELETE TO authenticated USING (true);
