-- 1. App role enum + user_roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. owner_profiles
CREATE TABLE public.owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_profiles_slug ON public.owner_profiles(slug);

ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own profile" ON public.owner_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Owner can insert own profile" ON public.owner_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner can update own profile" ON public.owner_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Public can view profiles by slug" ON public.owner_profiles
  FOR SELECT TO anon USING (slug IS NOT NULL AND onboarding_completed = true);

CREATE TRIGGER update_owner_profiles_updated_at
  BEFORE UPDATE ON public.owner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create empty owner_profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.owner_profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. invitations
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Public RPC to validate an invitation token (no direct table access)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'email', email,
    'expires_at', expires_at,
    'used_at', used_at,
    'valid', (used_at IS NULL AND expires_at > now())
  )
  INTO result
  FROM public.invitations
  WHERE token = p_token;
  RETURN COALESCE(result, jsonb_build_object('valid', false));
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_invitation(p_token TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = p_token;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.expires_at < now() THEN
    RETURN false;
  END IF;
  UPDATE public.invitations SET used_at = now(), used_by = p_user_id WHERE id = inv.id;
  RETURN true;
END;
$$;