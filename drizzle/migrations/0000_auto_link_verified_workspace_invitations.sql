CREATE OR REPLACE FUNCTION public.accept_pending_workspace_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_id uuid := auth.uid();
  account_email text;
  inv record;
  accepted_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(trim(email)) INTO account_email FROM auth.users
  WHERE id = account_id AND email_confirmed_at IS NOT NULL;
  IF account_email IS NULL THEN
    RAISE EXCEPTION 'Verified email required' USING ERRCODE = '42501';
  END IF;
  FOR inv IN
    SELECT * FROM public.invitations
    WHERE lower(trim(email)) = account_email AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at, id FOR UPDATE
  LOOP
    INSERT INTO public.user_roles(user_id, role) VALUES(account_id, 'user') ON CONFLICT DO NOTHING;
    IF inv.workspace_id IS NOT NULL THEN
      INSERT INTO public.workspace_members(workspace_id, user_id, role)
      VALUES(inv.workspace_id, account_id, inv.workspace_role)
      ON CONFLICT(workspace_id, user_id) DO NOTHING;
      accepted_ids := array_append(accepted_ids, inv.workspace_id);
    END IF;
    UPDATE public.invitations SET used_at = now(), used_by = account_id WHERE id = inv.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'workspace_ids', to_jsonb(accepted_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.accept_pending_workspace_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_pending_workspace_invitations() TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_workspace_invitation(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  account_email text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(trim(email)) INTO account_email FROM auth.users
  WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
  IF account_email IS NULL THEN
    RAISE EXCEPTION 'Verified email required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM public.invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;
  IF lower(trim(inv.email)) <> account_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
  END IF;
  IF inv.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', inv.used_by = p_user_id, 'workspace_id', inv.workspace_id, 'workspace_role', inv.workspace_role);
  END IF;
  IF inv.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES(p_user_id, 'user') ON CONFLICT DO NOTHING;
  IF inv.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members(workspace_id, user_id, role)
    VALUES(inv.workspace_id, p_user_id, inv.workspace_role)
    ON CONFLICT(workspace_id, user_id) DO NOTHING;
  END IF;
  UPDATE public.invitations SET used_at = now(), used_by = p_user_id WHERE id = inv.id;
  RETURN jsonb_build_object('success', true, 'workspace_id', inv.workspace_id, 'workspace_role', inv.workspace_role);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_workspace_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_workspace_invitation(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_invitation(p_token text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((public.consume_workspace_invitation(p_token, p_user_id)->>'success')::boolean, false);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text, uuid) TO authenticated;