SELECT cron.unschedule('process-followup-tasks-every-minute');

SELECT cron.schedule(
  'process-followup-tasks-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rvangzupebrajhhhvewu.supabase.co/functions/v1/process-followup-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron', '1',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := concat('{"ran_at":"', now(), '"}')::jsonb
  );
  $$
);