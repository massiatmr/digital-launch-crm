-- Allow anon to read invitation by token via RPC only (already exists). Make sure the consume function also creates a 'user' role.
CREATE OR REPLACE FUNCTION public.consume_invitation(p_token text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = p_token;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.expires_at < now() THEN
    RETURN false;
  END IF;
  UPDATE public.invitations SET used_at = now(), used_by = p_user_id WHERE id = inv.id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$function$;

-- Grant execute on the lookup + consume to anon (RPC already SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text, uuid) TO anon, authenticated;