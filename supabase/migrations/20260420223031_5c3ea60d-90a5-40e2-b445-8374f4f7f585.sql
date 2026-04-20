CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_ws_id UUID;
  has_pending_invite BOOLEAN := false;
  invite_token_meta TEXT;
  is_admin_user BOOLEAN := false;
BEGIN
  -- Toujours créer owner_profiles
  INSERT INTO public.owner_profiles (user_id, email, onboarding_completed)
  VALUES (NEW.id, NEW.email, true)
  ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = true;

  -- Vérifier si invitation valide
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

  -- Vérifier si l'utilisateur est admin (par email seed - non applicable au signup)
  -- Onboarding désactivé : ne plus créer de workspace "Mon espace" automatiquement.
  -- Seuls les admins (manuellement) ou les invitations peuvent attribuer un workspace.

  RETURN NEW;
END;
$function$;