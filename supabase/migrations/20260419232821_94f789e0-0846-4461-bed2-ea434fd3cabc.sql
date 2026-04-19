DO $$
DECLARE
  v_user_id uuid := '3a9e61e7-acee-48c9-92ab-5df0ec9bb92b';
  v_ws_id uuid;
BEGIN
  -- Recreate Digital Launch workspace
  INSERT INTO public.workspaces (company_name, created_by, onboarding_completed)
  VALUES ('Digital Launch', v_user_id, true)
  RETURNING id INTO v_ws_id;

  -- Add user as owner
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws_id, v_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Reattach orphan leads owned by this user with no workspace
  UPDATE public.leads
  SET workspace_id = v_ws_id
  WHERE owner_id = v_user_id AND workspace_id IS NULL;

  -- Same safety net for related orphan rows
  UPDATE public.clients SET workspace_id = v_ws_id WHERE owner_id = v_user_id AND workspace_id IS NULL;
  UPDATE public.offers  SET workspace_id = v_ws_id WHERE owner_id = v_user_id AND workspace_id IS NULL;
  UPDATE public.bookings SET workspace_id = v_ws_id WHERE owner_id = v_user_id AND workspace_id IS NULL;
END $$;