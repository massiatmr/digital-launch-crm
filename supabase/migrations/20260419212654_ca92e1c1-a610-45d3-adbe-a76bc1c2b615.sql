
-- ============================================
-- ITÉRATION A : Workspaces multi-tenant
-- ============================================

-- 1. Enum pour le rôle au sein d'un workspace
CREATE TYPE public.workspace_role AS ENUM ('owner', 'member');

-- 2. Table workspaces (évolution conceptuelle de owner_profiles)
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '',
  legal_name TEXT DEFAULT '',
  siret TEXT DEFAULT '',
  vat_number TEXT DEFAULT '',
  address TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  signature_url TEXT DEFAULT '',
  slug TEXT UNIQUE,
  brand_color TEXT DEFAULT '#7C3AED',
  email_sender_name TEXT DEFAULT '',
  email_signature TEXT DEFAULT '',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table workspace_members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);

-- 4. Security definer functions (anti-récursion RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.user_workspace_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = _user_id
$$;

-- 5. RLS workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Owners can update their workspaces" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.is_workspace_owner(id, auth.uid()));

CREATE POLICY "Authenticated can create workspaces" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can delete their workspaces" ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.is_workspace_owner(id, auth.uid()));

CREATE POLICY "Public can view workspaces by slug" ON public.workspaces
  FOR SELECT TO anon
  USING (slug IS NOT NULL AND onboarding_completed = true);

-- 6. RLS workspace_members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their memberships" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owners manage members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

-- 7. Trigger updated_at workspaces
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. BACKFILL : 1 workspace par owner_profiles existant + membership owner
INSERT INTO public.workspaces (
  id, company_name, legal_name, siret, vat_number, address, email, phone,
  logo_url, signature_url, slug, brand_color, email_sender_name, email_signature,
  onboarding_completed, created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(), -- nouveau workspace_id
  COALESCE(NULLIF(company_name, ''), 'Mon espace'),
  legal_name, siret, vat_number, address, email, phone,
  logo_url, signature_url, slug, brand_color, email_sender_name, email_signature,
  onboarding_completed, user_id, created_at, updated_at
FROM public.owner_profiles;

-- Rattacher chaque user en owner de son workspace
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.created_by, 'owner'::workspace_role
FROM public.workspaces w
WHERE w.created_by IS NOT NULL;

-- 9. Ajouter workspace_id sur toutes les tables data + backfill
-- Helper : on map owner_id (auth.uid des anciens profiles) → workspace_id

-- LEADS
ALTER TABLE public.leads ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.leads l SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = l.owner_id;

-- CLIENTS
ALTER TABLE public.clients ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.clients c SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = c.owner_id;

-- OFFERS
ALTER TABLE public.offers ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.offers o SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = o.owner_id;

-- BOOKINGS
ALTER TABLE public.bookings ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.bookings b SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = b.owner_id;

-- REMINDERS
ALTER TABLE public.reminders ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.reminders r SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = r.owner_id;

-- LEAD_ACTIVITIES
ALTER TABLE public.lead_activities ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.lead_activities la SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = la.owner_id;

-- LEAD_CONVERSATION_STATE
ALTER TABLE public.lead_conversation_state ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.lead_conversation_state lcs SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = lcs.owner_id;

-- LEAD_FOLLOWUP_TASKS
ALTER TABLE public.lead_followup_tasks ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.lead_followup_tasks lft SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = lft.owner_id;

-- GENERATED_MESSAGES
ALTER TABLE public.generated_messages ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.generated_messages gm SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = gm.owner_id;

-- SALES_SCRIPTS
ALTER TABLE public.sales_scripts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.sales_scripts ss SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = ss.owner_id;

-- CLIENT_ACTIVITIES
ALTER TABLE public.client_activities ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.client_activities ca SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = ca.owner_id;

-- CLIENT_RESOURCES
ALTER TABLE public.client_resources ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.client_resources cr SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = cr.owner_id;

-- CONTRACT_SIGNATURES
ALTER TABLE public.contract_signatures ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.contract_signatures cs SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = cs.owner_id;

-- INVOICES
ALTER TABLE public.invoices ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.invoices i SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = i.owner_id;

-- WHATSAPP_CONFIG
ALTER TABLE public.whatsapp_config ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.whatsapp_config wc SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = wc.owner_id;

-- WHATSAPP_MESSAGES
ALTER TABLE public.whatsapp_messages ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.whatsapp_messages wm SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = wm.owner_id;

-- WHATSAPP_TEMPLATES
ALTER TABLE public.whatsapp_templates ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.whatsapp_templates wt SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = wt.owner_id;

-- META_PAGES
ALTER TABLE public.meta_pages ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.meta_pages mp SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = mp.owner_id;

-- FOLLOWUP_AUTOMATION_SETTINGS
ALTER TABLE public.followup_automation_settings ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.followup_automation_settings fas SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = fas.owner_id;

-- FOLLOWUP_SEQUENCE_STEPS
ALTER TABLE public.followup_sequence_steps ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.followup_sequence_steps fss SET workspace_id = w.id
  FROM public.workspaces w WHERE w.created_by = fss.owner_id;

-- 10. Index pour perf
CREATE INDEX idx_leads_workspace ON public.leads(workspace_id);
CREATE INDEX idx_clients_workspace ON public.clients(workspace_id);
CREATE INDEX idx_offers_workspace ON public.offers(workspace_id);
CREATE INDEX idx_bookings_workspace ON public.bookings(workspace_id);
CREATE INDEX idx_reminders_workspace ON public.reminders(workspace_id);
CREATE INDEX idx_lead_activities_workspace ON public.lead_activities(workspace_id);
CREATE INDEX idx_lead_followup_tasks_workspace ON public.lead_followup_tasks(workspace_id);
CREATE INDEX idx_whatsapp_messages_workspace ON public.whatsapp_messages(workspace_id);

-- 11. Nouvelle fonction handle_new_user (crée un workspace par défaut au signup si pas via invite)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_ws_id UUID;
BEGIN
  -- Garde l'ancien comportement : owner_profiles (pour compat)
  INSERT INTO public.owner_profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  -- Crée un workspace par défaut + membership owner
  INSERT INTO public.workspaces (company_name, email, created_by)
  VALUES ('Mon espace', NEW.email, NEW.id)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
