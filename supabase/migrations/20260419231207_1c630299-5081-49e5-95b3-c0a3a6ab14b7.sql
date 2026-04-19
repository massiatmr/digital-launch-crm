-- 1. Améliorer consume_workspace_invitation : supprime le workspace solo auto-créé vide après avoir rejoint le workspace de l'invitation
CREATE OR REPLACE FUNCTION public.consume_workspace_invitation(p_token text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  solo_ws RECORD;
  has_data BOOLEAN;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = p_token;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;

  UPDATE public.invitations SET used_at = now(), used_by = p_user_id WHERE id = inv.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'user')
  ON CONFLICT DO NOTHING;

  IF inv.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, p_user_id, inv.workspace_role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    -- Cleanup : supprime "Mon espace" auto-créé vide si l'utilisateur en avait un
    FOR solo_ws IN
      SELECT w.id FROM public.workspaces w
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = p_user_id
        AND w.created_by = p_user_id
        AND w.company_name = 'Mon espace'
        AND w.id <> inv.workspace_id
    LOOP
      -- Vérifie que ce workspace n'a aucune donnée
      SELECT EXISTS (
        SELECT 1 FROM public.leads WHERE workspace_id = solo_ws.id
        UNION ALL SELECT 1 FROM public.clients WHERE workspace_id = solo_ws.id
        UNION ALL SELECT 1 FROM public.offers WHERE workspace_id = solo_ws.id
      ) INTO has_data;
      IF NOT has_data THEN
        DELETE FROM public.workspace_members WHERE workspace_id = solo_ws.id;
        DELETE FROM public.workspaces WHERE id = solo_ws.id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', inv.workspace_id,
    'workspace_role', inv.workspace_role
  );
END;
$function$;

-- 2. Améliorer consume_invitation_from_metadata avec le même cleanup
CREATE OR REPLACE FUNCTION public.consume_invitation_from_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invite_token_meta TEXT;
  inv RECORD;
  solo_ws RECORD;
  has_data BOOLEAN;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';

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

      -- Cleanup workspace solo auto-créé
      FOR solo_ws IN
        SELECT w.id FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = NEW.id
          AND w.created_by = NEW.id
          AND w.company_name = 'Mon espace'
          AND w.id <> inv.workspace_id
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM public.leads WHERE workspace_id = solo_ws.id
          UNION ALL SELECT 1 FROM public.clients WHERE workspace_id = solo_ws.id
          UNION ALL SELECT 1 FROM public.offers WHERE workspace_id = solo_ws.id
        ) INTO has_data;
        IF NOT has_data THEN
          DELETE FROM public.workspace_members WHERE workspace_id = solo_ws.id;
          DELETE FROM public.workspaces WHERE id = solo_ws.id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Réparer le compte de Massinissa : le rattacher à Digital Launch + supprimer son Mon espace vide
DO $$
DECLARE
  v_user_id uuid := '8168b57c-185a-4081-be3c-e44dc5be0a95';
  v_target_ws uuid := 'eb0379ad-e0ee-4f86-badf-95d34bf846f1'; -- Digital Launch
  v_solo_ws uuid := '7419de56-6a8f-4d0c-bcce-3e333cc583b4'; -- Mon espace auto-créé
BEGIN
  -- Rattacher à Digital Launch
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_target_ws, v_user_id, 'member')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Supprimer son Mon espace vide
  DELETE FROM public.workspace_members WHERE workspace_id = v_solo_ws AND user_id = v_user_id;
  DELETE FROM public.workspaces WHERE id = v_solo_ws;

  -- Marquer son onboarding comme complété (il rejoint un workspace existant)
  UPDATE public.owner_profiles SET onboarding_completed = true WHERE user_id = v_user_id;

  -- Mettre à jour l'invitation pour refléter le bon workspace
  UPDATE public.invitations
    SET workspace_id = v_target_ws, workspace_role = 'member'
    WHERE id = '64605d7a-277c-42bd-8bbe-8f4803ec1c3f';
END $$;