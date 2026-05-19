// Batch processor: trouve les tâches scheduled dues et invoque execute-followup-task pour chacune.
// Appelé par pg_cron toutes les minutes OU manuellement depuis l'UI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: accept service role (cron) OR a logged-in user (UI). Reject anonymous.
    const bearer = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const internalCron = req.headers.get('x-internal-cron') === '1';
    const isServiceRole = bearer.length > 0 && bearer === SERVICE_KEY;
    let callerUserId: string | null = null;
    if (!isServiceRole && !internalCron) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Use getUser (works in supabase-js v2)
      const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerUserId = userData.user.id;
    }

    // Optional: limit to a single owner if invoked from UI
    let ownerFilter: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.owner_id) ownerFilter = body.owner_id;
    } catch (_) {}

    // Non-service callers can only process their own tasks
    if (!isServiceRole && !internalCron && callerUserId) {
      ownerFilter = callerUserId;
    }

    let query = admin
      .from('lead_followup_tasks')
      .select('id, owner_id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);
    if (ownerFilter) query = query.eq('owner_id', ownerFilter);

    const { data: tasks, error } = await query;
    if (error) throw error;

    const results: Array<{ task_id: string; ok: boolean; error?: string }> = [];

    for (const t of tasks ?? []) {
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
        results.push({ task_id: t.id, ok, error: ok ? undefined : txt.slice(0, 200) });
      } catch (e: any) {
        results.push({ task_id: t.id, ok: false, error: String(e?.message ?? e) });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results, ran_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
