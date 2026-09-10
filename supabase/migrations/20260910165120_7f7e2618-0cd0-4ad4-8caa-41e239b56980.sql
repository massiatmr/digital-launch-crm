CREATE TABLE IF NOT EXISTS public.workspace_smtp_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  host text,
  port integer NOT NULL DEFAULT 587,
  username text,
  password text,
  from_email text,
  from_name text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.workspace_smtp_settings TO service_role;
ALTER TABLE public.workspace_smtp_settings ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: access only through the security definer RPCs below.

CREATE OR REPLACE FUNCTION public.get_workspace_smtp(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.workspace_smtp_settings;
BEGIN
  IF NOT (public.is_workspace_owner(auth.uid(), _workspace_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO r FROM public.workspace_smtp_settings WHERE workspace_id = _workspace_id;
  IF r.workspace_id IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true,
    'enabled', r.enabled,
    'host', r.host,
    'port', r.port,
    'username', r.username,
    'from_email', r.from_email,
    'from_name', r.from_name,
    'has_password', (r.password IS NOT NULL AND r.password <> ''),
    'updated_at', r.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_workspace_smtp(
  _workspace_id uuid,
  _enabled boolean,
  _host text,
  _port integer,
  _username text,
  _from_email text,
  _from_name text,
  _password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_workspace_owner(auth.uid(), _workspace_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.workspace_smtp_settings AS w
    (workspace_id, enabled, host, port, username, from_email, from_name, password, updated_by, updated_at)
  VALUES
    (_workspace_id, COALESCE(_enabled, true), _host, COALESCE(_port, 587), _username, _from_email, _from_name,
     NULLIF(_password, ''), auth.uid(), now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    enabled = COALESCE(EXCLUDED.enabled, w.enabled),
    host = EXCLUDED.host,
    port = COALESCE(EXCLUDED.port, 587),
    username = EXCLUDED.username,
    from_email = EXCLUDED.from_email,
    from_name = EXCLUDED.from_name,
    password = COALESCE(EXCLUDED.password, w.password),
    updated_by = auth.uid(),
    updated_at = now();

  RETURN public.get_workspace_smtp(_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_workspace_smtp(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_workspace_owner(auth.uid(), _workspace_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  DELETE FROM public.workspace_smtp_settings WHERE workspace_id = _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_smtp(uuid) FROM public;
REVOKE ALL ON FUNCTION public.save_workspace_smtp(uuid, boolean, text, integer, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_workspace_smtp(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_smtp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_workspace_smtp(uuid, boolean, text, integer, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_workspace_smtp(uuid) TO authenticated, service_role;