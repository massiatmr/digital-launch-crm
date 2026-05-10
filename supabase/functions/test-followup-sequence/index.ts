// Edge function: déclenche une séquence de relances ACCÉLÉRÉE (÷60) sur un lead choisi.
// minutes → secondes, heures → minutes, jours → heures. Idéal pour tester le déroulé complet en ~3 min.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const lead_id = body?.lead_id as string | undefined;
    if (!lead_id) return new Response(JSON.stringify({ error: 'lead_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify lead belongs to user
    const { data: lead } = await admin.from('leads').select('id, owner_id, name, offer_id').eq('id', lead_id).maybeSingle();
    if (!lead || lead.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'lead not found or access denied' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cancel existing pending/scheduled tasks for this lead
    await admin.from('lead_followup_tasks').update({ status: 'cancelled' }).eq('lead_id', lead_id).in('status', ['pending', 'scheduled']);

    // Try offer-specific sequence first, fallback to default (offer_id IS NULL)
    let steps: any[] = [];
    if (lead.offer_id) {
      const { data: offerSteps } = await admin
        .from('followup_sequence_steps')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_enabled', true)
        .eq('offer_id', lead.offer_id)
        .order('step_order', { ascending: true });
      if (offerSteps && offerSteps.length > 0) steps = offerSteps;
    }
    if (steps.length === 0) {
      const { data: defaultSteps } = await admin
        .from('followup_sequence_steps')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_enabled', true)
        .is('offer_id', null)
        .order('step_order', { ascending: true });
      steps = defaultSteps ?? [];
    }

    if (!steps || steps.length === 0) {
      return new Response(JSON.stringify({ error: 'no steps configured', steps_created: 0 }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create accelerated tasks (÷60 the delay)
    const created: any[] = [];
    let cumulativeSeconds = 0;
    for (const s of steps) {
      // base seconds (minutes→sec, hours→min as sec, days→hours as sec)
      let baseSec = 0;
      if (s.delay_unit === 'minutes') baseSec = s.delay_value * 1; // min → sec
      else if (s.delay_unit === 'hours') baseSec = s.delay_value * 60; // h → min in sec
      else if (s.delay_unit === 'days') baseSec = s.delay_value * 3600; // days → hours in sec
      cumulativeSeconds += Math.max(baseSec, 5); // minimum 5s between steps
      const scheduledAt = new Date(Date.now() + cumulativeSeconds * 1000).toISOString();

      const { data: task, error } = await admin.from('lead_followup_tasks').insert({
        lead_id,
        owner_id: user.id,
        task_type: s.task_type,
        status: 'scheduled',
        scheduled_at: scheduledAt,
        step_order: s.step_order,
      }).select('*').single();
      if (error) throw error;
      created.push({ id: task.id, type: s.task_type, scheduled_at: scheduledAt, in_seconds: cumulativeSeconds });
    }

    return new Response(JSON.stringify({
      ok: true,
      lead_id,
      lead_name: lead.name,
      steps_created: created.length,
      total_duration_seconds: cumulativeSeconds,
      tasks: created,
      message: `${created.length} tâches créées (durée totale: ${cumulativeSeconds}s). Le cron les exécutera au fil de l'eau.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
