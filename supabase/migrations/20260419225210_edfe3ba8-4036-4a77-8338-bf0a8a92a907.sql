
-- 1) Refonte handle_new_user : ne crée pas de workspace par défaut si invitation valide
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_ws_id UUID;
  has_pending_invite BOOLEAN := false;
  invite_token_meta TEXT;
BEGIN
  -- Toujours créer owner_profiles
  INSERT INTO public.owner_profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  -- Vérifier si invitation valide (par metadata token OU par email)
  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';

  IF invite_token_meta IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE token = invite_token_meta
        AND used_at IS NULL
        AND expires_at > now()
        AND workspace_id IS NOT NULL
    ) INTO has_pending_invite;
  END IF;

  IF NOT has_pending_invite THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE lower(email) = lower(NEW.email)
        AND used_at IS NULL
        AND expires_at > now()
        AND workspace_id IS NOT NULL
    ) INTO has_pending_invite;
  END IF;

  -- Créer un workspace par défaut UNIQUEMENT si pas d'invitation
  IF NOT has_pending_invite THEN
    INSERT INTO public.workspaces (company_name, email, created_by)
    VALUES ('Mon espace', NEW.email, NEW.id)
    RETURNING id INTO new_ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_ws_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger handle_new_user (au cas où il n'existerait pas)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2) Auto-confirm email pour les invités (BEFORE INSERT)
CREATE OR REPLACE FUNCTION public.auto_confirm_invited_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_invite BOOLEAN := false;
  invite_token_meta TEXT;
BEGIN
  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';

  IF invite_token_meta IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE token = invite_token_meta
        AND used_at IS NULL
        AND expires_at > now()
    ) INTO has_invite;
  END IF;

  IF NOT has_invite THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitations
      WHERE lower(email) = lower(NEW.email)
        AND used_at IS NULL
        AND expires_at > now()
    ) INTO has_invite;
  END IF;

  IF has_invite AND NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_invited_users();

-- 3) Auto-consume invitation après confirmation email
CREATE OR REPLACE FUNCTION public.consume_invitation_from_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invite_token_meta TEXT;
  inv RECORD;
BEGIN
  -- Seulement quand email vient d'être confirmé
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';

  -- Cherche par token explicite, sinon par email
  IF invite_token_meta IS NOT NULL THEN
    SELECT * INTO inv FROM public.invitations
    WHERE token = invite_token_meta
      AND used_at IS NULL
      AND expires_at > now()
    LIMIT 1;
  END IF;

  IF NOT FOUND OR inv.id IS NULL THEN
    SELECT * INTO inv FROM public.invitations
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF FOUND AND inv.id IS NOT NULL THEN
    UPDATE public.invitations
      SET used_at = now(), used_by = NEW.id
      WHERE id = inv.id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;

    IF inv.workspace_id IS NOT NULL THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (inv.workspace_id, NEW.id, inv.workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.consume_invitation_from_metadata();
