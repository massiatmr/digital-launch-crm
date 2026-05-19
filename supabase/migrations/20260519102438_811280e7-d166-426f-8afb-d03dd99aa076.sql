CREATE OR REPLACE FUNCTION public.send_meta_capi_event(p_workspace_id uuid, p_lead_id uuid, p_event_name text, p_booking_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.meta_capi_configs;
  fn_url text;
  internal_secret text;
BEGIN
  SELECT * INTO cfg FROM public.meta_capi_configs WHERE workspace_id = p_workspace_id;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE THEN RETURN; END IF;

  fn_url := 'https://rvangzupebrajhhhvewu.supabase.co/functions/v1/meta-capi-send';
  internal_secret := current_setting('app.internal_function_secret', true);

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-token', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object(
      'workspace_id', p_workspace_id,
      'lead_id', p_lead_id,
      'event_name', p_event_name,
      'booking_id', p_booking_id
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'meta capi dispatch failed: %', SQLERRM;
END;
$function$;