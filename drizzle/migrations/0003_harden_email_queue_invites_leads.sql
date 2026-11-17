REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.auto_confirm_invited_users()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE has_invite BOOLEAN := false; invite_token_meta TEXT;
BEGIN
  invite_token_meta := NEW.raw_user_meta_data ->> 'invite_token';
  -- Require the secret invitation token AND matching email (proof of receiving the invite)
  IF invite_token_meta IS NOT NULL AND length(invite_token_meta) >= 16 THEN
    SELECT EXISTS (SELECT 1 FROM public.invitations
      WHERE token = invite_token_meta AND lower(email) = lower(NEW.email)
        AND used_at IS NULL AND expires_at > now()) INTO has_invite;
  END IF;
  IF has_invite AND NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Workspace can select leads" ON public.leads;
CREATE POLICY "Workspace can select leads" ON public.leads FOR SELECT TO authenticated
USING (deleted_at IS NULL AND ((owner_id = auth.uid() AND workspace_id IS NULL)
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "Workspace can update leads" ON public.leads;
CREATE POLICY "Workspace can update leads" ON public.leads FOR UPDATE TO authenticated
USING ((owner_id = auth.uid() AND workspace_id IS NULL)
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Workspace can delete leads" ON public.leads;
CREATE POLICY "Workspace can delete leads" ON public.leads FOR DELETE TO authenticated
USING ((owner_id = auth.uid() AND workspace_id IS NULL)
  OR (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role));