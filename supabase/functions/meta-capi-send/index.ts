import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_VERSION = 'v25.0';

function normalizePhone(p: string | null): string | null {
  if (!p) return null;
  return p.replace(/[^\d]/g, '');
}

function normalizeEmail(e: string | null): string | null {
  if (!e) return null;
  return e.trim().toLowerCase();
}

function normalizeName(n: string | null): string | null {
  if (!n) return null;
  return n.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashIfPresent(v: string | null): Promise<string | undefined> {
  if (!v) return undefined;
  return await sha256(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Require service role — only called by DB triggers / internal functions
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { workspace_id, lead_id, event_name, booking_id } = await req.json();
    if (!workspace_id || !lead_id || !event_name) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cfg } = await admin.from('meta_capi_configs').select('*').eq('workspace_id', workspace_id).maybeSingle();
    if (!cfg || !cfg.enabled) {
      return new Response(JSON.stringify({ skipped: 'no config' }), { headers: corsHeaders });
    }

    const { data: lead } = await admin.from('leads').select('*').eq('id', lead_id).maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: 'lead not found' }), { status: 404, headers: corsHeaders });
    }

    const meta = (lead.metadata || {}) as Record<string, any>;
    const fbLeadId = meta.fb_lead_id || meta.lead_id || meta.meta_lead_id || null;
    const fbc = meta.fbc || null;
    const fbp = meta.fbp || null;

    const [em, ph, fn, ln, ct] = await Promise.all([
      hashIfPresent(normalizeEmail(lead.email)),
      hashIfPresent(normalizePhone(lead.phone)),
      hashIfPresent(normalizeName((lead.name || '').split(' ')[0] || null)),
      hashIfPresent(normalizeName((lead.name || '').split(' ').slice(1).join(' ') || null)),
      hashIfPresent(normalizeName(lead.city || null)),
    ]);

    const user_data: Record<string, any> = {};
    if (em) user_data.em = [em];
    if (ph) user_data.ph = [ph];
    if (fn) user_data.fn = [fn];
    if (ln) user_data.ln = [ln];
    if (ct) user_data.ct = [ct];
    if (fbLeadId) user_data.lead_id = fbLeadId;
    if (fbc) user_data.fbc = fbc;
    if (fbp) user_data.fbp = fbp;

    const event_time = Math.floor(Date.now() / 1000);

    const payload: any = {
      data: [
        {
          action_source: 'system_generated',
          event_name,
          event_time,
          user_data,
          custom_data: {
            event_source: 'crm',
            lead_event_source: 'Digital Launch CRM',
            ...(booking_id ? { booking_id } : {}),
          },
        },
      ],
    };
    if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;

    const url = `https://graph.facebook.com/${META_API_VERSION}/${cfg.dataset_id}/events?access_token=${encodeURIComponent(cfg.access_token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    console.log('[meta-capi]', event_name, lead_id, res.status, JSON.stringify(body));

    return new Response(JSON.stringify({ ok: res.ok, meta: body }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[meta-capi] error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
