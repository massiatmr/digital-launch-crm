
-- 1. Workspace features toggles
CREATE TABLE public.workspace_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, feature_key)
);

ALTER TABLE public.workspace_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read features"
  ON public.workspace_features FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage features"
  ON public.workspace_features FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_workspace_features_updated
  BEFORE UPDATE ON public.workspace_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RPCs membres
CREATE OR REPLACE FUNCTION public.list_workspace_members(_workspace_id uuid)
RETURNS TABLE(user_id uuid, email text, role workspace_role, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_workspace_member(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT wm.user_id, u.email::text, wm.role, wm.created_at
    FROM public.workspace_members wm
    JOIN auth.users u ON u.id = wm.user_id
    WHERE wm.workspace_id = _workspace_id
    ORDER BY wm.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_workspace_owner(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_member_role(_workspace_id uuid, _user_id uuid, _role workspace_role)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_workspace_owner(_workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.workspace_members SET role = _role
  WHERE workspace_id = _workspace_id AND user_id = _user_id;
  RETURN true;
END;
$$;

-- 3. RLS workspace-aware (additif : on garde owner_id pour compat, on AJOUTE accès workspace)
-- Helper macro-style : on drop puis recrée les SELECT policies des tables critiques

-- LEADS
DROP POLICY IF EXISTS "Owner can select leads" ON public.leads;
CREATE POLICY "Workspace can select leads" ON public.leads FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owner can update leads" ON public.leads;
CREATE POLICY "Workspace can update leads" ON public.leads FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owner can delete leads" ON public.leads;
CREATE POLICY "Workspace can delete leads" ON public.leads FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_owner(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- CLIENTS
DROP POLICY IF EXISTS "Owner can select clients" ON public.clients;
CREATE POLICY "Workspace can select clients" ON public.clients FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owner can update clients" ON public.clients;
CREATE POLICY "Workspace can update clients" ON public.clients FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- OFFERS
DROP POLICY IF EXISTS "Owner can select offers" ON public.offers;
CREATE POLICY "Workspace can select offers" ON public.offers FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owner can update offers" ON public.offers;
CREATE POLICY "Workspace can update offers" ON public.offers FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- BOOKINGS
DROP POLICY IF EXISTS "Owner can select bookings" ON public.bookings;
CREATE POLICY "Workspace can select bookings" ON public.bookings FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owner can update bookings" ON public.bookings;
CREATE POLICY "Workspace can update bookings" ON public.bookings FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- WHATSAPP_MESSAGES
DROP POLICY IF EXISTS "Owner can select whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "Workspace can select whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- WHATSAPP_CONFIG
DROP POLICY IF EXISTS "Owner can select own wa config" ON public.whatsapp_config;
CREATE POLICY "Workspace can select wa config" ON public.whatsapp_config FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- META_PAGES
DROP POLICY IF EXISTS "Owner can select meta_pages" ON public.meta_pages;
CREATE POLICY "Workspace can select meta_pages" ON public.meta_pages FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid())) OR has_role(auth.uid(), 'admin'));

-- 4. Migration des données orphelines vers "Mon espace" de l'admin (Digital Launch)
DO $$
DECLARE
  admin_ws uuid;
  admin_uid uuid := '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b';
BEGIN
  SELECT w.id INTO admin_ws FROM public.workspaces w
  JOIN public.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = admin_uid AND wm.role = 'owner'
  ORDER BY w.created_at ASC LIMIT 1;

  IF admin_ws IS NOT NULL THEN
    UPDATE public.leads SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.clients SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.offers SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.bookings SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.whatsapp_messages SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.whatsapp_config SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.meta_pages SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.lead_activities SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.reminders SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.client_activities SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.client_resources SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.lead_conversation_state SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.generated_messages SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.sales_scripts SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
    UPDATE public.lead_followup_tasks SET workspace_id = admin_ws WHERE workspace_id IS NULL AND owner_id = admin_uid;
  END IF;
END $$;
