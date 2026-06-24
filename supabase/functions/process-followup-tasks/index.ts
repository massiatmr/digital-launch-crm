// Batch processor: trouve les tâches scheduled dues et invoque execute-followup-task pour chacune.
// Appelé par pg_cron toutes les minutes OU manuellement depuis l'UI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function isValidUserToken(admin: ReturnType<typeof createClient>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return null;
  return userData.user.id;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: accept service role, the scheduled backend cron using the anon key,
    // OR a logged-in user (UI). The cron only triggers the worker; all DB writes
    // still happen server-side through the service client and only for due tasks.
    const bearer = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const apiKey = req.headers.get('apikey') ?? '';

    // Strict equality check against env service key — NEVER trust unverified JWT payloads.
    const isServiceRole = bearer.length > 0 && bearer === SERVICE_KEY;
    const isScheduledCron = req.headers.get('x-internal-cron') === '1';


    let callerUserId: string | null = null;
    if (!isServiceRole && !isScheduledCron) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerUserId = await isValidUserToken(admin, bearer);
      if (!callerUserId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Optional: limit to a single owner if invoked from UI
    let ownerFilter: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.owner_id) ownerFilter = body.owner_id;
    } catch (_) {}

    // Non-service callers can only process their own tasks
    if (!isServiceRole && callerUserId) {
      ownerFilter = callerUserId;
    }


    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleTasks } = await admin
      .from('lead_followup_tasks')
      .update({
        status: 'scheduled',
        error_message: 'Recovered: tâche bloquée en processing >10min, remise en file',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('status', 'processing')
      .lt('updated_at', staleCutoff)
      .neq('task_type', 'manual_call')
      .select('id');

    // Les tâches qui ont échoué pendant l'ancien délai de sécurité/timeout doivent
    // être rejouées automatiquement, sinon elles restent dues mais invisibles.
    const retryCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: retryableTasks } = await admin
      .from('lead_followup_tasks')
      .update({
        status: 'scheduled',
        error_message: 'Recovered: ancienne erreur temporaire, remise en file',
        updated_at: new Date().toISOString(),
      } as any)
      .in('status', ['failed'])
      .neq('task_type', 'manual_call')
      .lte('scheduled_at', new Date().toISOString())
      .lt('updated_at', retryCutoff)
      .or('error_message.ilike.%timeout%,error_message.ilike.%context canceled%,error_message.ilike.%Function not available%')
      .select('id');

    let query = admin
      .from('lead_followup_tasks')
      .select('id, owner_id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20);
    if (ownerFilter) query = query.eq('owner_id', ownerFilter);

    const { data: tasks, error } = await query;
    if (error) throw error;

    const results = await runWithConcurrency(tasks ?? [], 4, async (t: any): Promise<{ task_id: string; ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/execute-followup-task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
            'x-internal-cron': '1',
          },
          body: JSON.stringify({ task_id: t.id, owner_id: t.owner_id }),
        });
        const ok = res.ok;
        const txt = ok ? '' : await res.text();
        return { task_id: t.id, ok, error: ok ? undefined : txt.slice(0, 200) };
      } catch (e: any) {
        return { task_id: t.id, ok: false, error: String(e?.message ?? e) };
      }
    });

    return new Response(
      JSON.stringify({
        recovered_stale: staleTasks?.length ?? 0,
        recovered_retryable: retryableTasks?.length ?? 0,
        processed: results.length,
        results,
        ran_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
