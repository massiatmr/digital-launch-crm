CREATE OR REPLACE FUNCTION public.consume_invitation_from_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite_token_meta TEXT;
  v_inv_id UUID;
  v_ws UUID;
  v_role workspace_role;
  solo_ws RECORD;
  has_data BOOLEAN;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL THEN RETURN NEW; END IF;

  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';
  IF invite_token_meta IS NOT NULL THEN
    SELECT id, workspace_id, workspace_role INTO v_inv_id, v_ws, v_role FROM public.invitations
    WHERE token = invite_token_meta AND used_at IS NULL AND expires_at > now() LIMIT 1;
  END IF;
  IF v_inv_id IS NULL THEN
    SELECT id, workspace_id, workspace_role INTO v_inv_id, v_ws, v_role FROM public.invitations
    WHERE lower(email) = lower(NEW.email) AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_inv_id IS NOT NULL THEN
    UPDATE public.invitations SET used_at = now(), used_by = NEW.id WHERE id = v_inv_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
    IF v_ws IS NOT NULL THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (v_ws, NEW.id, COALESCE(v_role, 'member'))
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
      FOR solo_ws IN
        SELECT w.id FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = NEW.id AND w.created_by = NEW.id
          AND w.company_name = 'Mon espace' AND w.id <> v_ws
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
$$;