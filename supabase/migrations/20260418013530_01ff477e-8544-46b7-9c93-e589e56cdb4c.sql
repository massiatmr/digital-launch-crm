-- Schedule pg_cron to process due followup tasks every minute
SELECT cron.schedule(
  'process-followup-tasks-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://rvangzupebrajhhhvewu.supabase.co/functions/v1/process-followup-tasks',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YW5nenVwZWJyYWpoaGh2ZXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMzE1MDUsImV4cCI6MjA4ODkwNzUwNX0.1Omo3CkZIpBGewA-K4eSNUsdbAHaWvZEI3LCeL6gAwY"}'::jsonb,
    body:=concat('{"ran_at":"', now(), '"}')::jsonb
  );
  $$
);

-- Helper RPC to expose cron job status to authenticated users
CREATE OR REPLACE FUNCTION public.get_followup_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_row record;
  last_run record;
BEGIN
  SELECT * INTO job_row FROM cron.job WHERE jobname = 'process-followup-tasks-every-minute';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false, 'jobname', null);
  END IF;
  SELECT * INTO last_run FROM cron.job_run_details
    WHERE jobid = job_row.jobid
    ORDER BY start_time DESC LIMIT 1;
  RETURN jsonb_build_object(
    'active', job_row.active,
    'jobname', job_row.jobname,
    'schedule', job_row.schedule,
    'last_run_at', last_run.start_time,
    'last_run_status', last_run.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_followup_cron_status() TO authenticated;