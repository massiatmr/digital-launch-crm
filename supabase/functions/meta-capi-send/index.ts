import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-token',
};

const META_API_VERSION = 'v25.0';

// Events that originate from a page interaction (best sent with action_source=website)
const WEBSITE_EVENTS = new Set(['Lead', 'Schedule', 'CompleteRegistration']);

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

async function sendEventForLead(
  admin: any,
  cfg: any,
  lead: any,
  event_name: string,
  booking_id?: string | null,
): Promise<{ ok: boolean; meta: any; status: number }> {
  const meta = (lead.metadata || {}) as Record<string, any>;
  const fbLeadId = meta.fb_lead_id || meta.lead_id || meta.meta_lead_id || null;
  const fbc = meta.fbc || null;
  const fbp = meta.fbp || null;
  const clientIp = meta.client_ip_address || null;
  const clientUa = meta.client_user_agent || null;
  const eventSourceUrl = meta.event_source_url || null;

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
  if (clientIp) user_data.client_ip_address = clientIp;
  if (clientUa) user_data.client_user_agent = clientUa;

  const event_time = Math.floor(Date.now() / 1000);
  const isWebsite = WEBSITE_EVENTS.has(event_name);
  const action_source = isWebsite ? 'website' : 'system_generated';

  const eventObj: any = {
    action_source,
    event_name,
    event_time,
    event_id: `lead:${lead.id}:${event_name}${booking_id ? `:${booking_id}` : ''}`,
    user_data,
    custom_data: {
      event_source: 'crm',
      lead_event_source: 'Digital Launch CRM',
      ...(booking_id ? { booking_id } : {}),
    },
  };
  // event_source_url is required when action_source=website
  if (isWebsite) {
    eventObj.event_source_url = eventSourceUrl || 'https://crm.digitallaunch-llc.com/';
  }

  const payload: any = { data: [eventObj] };
  if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;

  const url = `https://graph.facebook.com/${META_API_VERSION}/${cfg.dataset_id}/events?access_token=${encodeURIComponent(cfg.access_token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log('[meta-capi]', event_name, lead.id, res.status, JSON.stringify(body));

  // Mark lead so we don't re-send the same conversion twice via backfill
  if (res.ok && event_name === 'Lead') {
    try {
      await admin
        .from('leads')
        .update({ metadata: { ...meta, capi_lead_sent_at: new Date().toISOString() } } as any)
        .eq('id', lead.id);
    } catch { /* non-fatal */ }
  }

  return { ok: res.ok, meta: body, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: service role, internal shared secret, or authenticated user JWT.
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const internalSecret = req.headers.get('x-internal-token') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const internalExpected = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  let authorized = auth === serviceRole;
  if (!authorized && internalExpected && internalSecret === internalExpected) authorized = true;
  if (!authorized && auth) {
    try {
      const supa = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${auth}` } } },
      );
      const { data: userData } = await supa.auth.getUser(auth);
      if (userData?.user?.id) authorized = true;
    } catch { /* ignore */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const bodyReq = await req.json();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // -------- Backfill mode --------
    if (bodyReq?.backfill && bodyReq.workspace_id) {
      const workspace_id: string = bodyReq.workspace_id;
      const days: number = Math.min(Math.max(Number(bodyReq.days) || 7, 1), 30);
      const since = new Date(Date.now() - days * 86400_000).toISOString();

      const { data: cfg, error: cfgErr } = await admin.from('meta_capi_configs').select('*').eq('workspace_id', workspace_id).maybeSingle();
      if (cfgErr) {
        return new Response(JSON.stringify({ error: 'config_read_failed', details: cfgErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!cfg) {
        return new Response(JSON.stringify({ error: 'no_capi_config', hint: 'Enregistrez d\'abord Dataset ID et Access Token dans Réglages → Meta CAPI.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!cfg.enabled) {
        return new Response(JSON.stringify({ error: 'capi_disabled', hint: 'Activez Meta CAPI dans Réglages avant de rattraper.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (cfg.send_lead === false) {
        return new Response(JSON.stringify({ error: 'send_lead_disabled', hint: 'Activez le toggle « Nouveau lead → Lead » avant de rattraper.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!cfg.dataset_id || !cfg.access_token) {
        return new Response(JSON.stringify({ error: 'missing_credentials', hint: 'Dataset ID et Access Token requis.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: leads, error: leadsErr } = await admin
        .from('leads')
        .select('id, name, email, phone, metadata, created_at')
        .eq('workspace_id', workspace_id)
        .gte('created_at', since)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(500);
      if (leadsErr) {
        return new Response(JSON.stringify({ error: 'leads_read_failed', details: leadsErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let sent = 0, skipped = 0, failed = 0;
      const errors: Array<{ lead_id: string; status: number; message: string }> = [];
      for (const lead of leads || []) {
        const meta = (lead.metadata || {}) as Record<string, any>;
        if (meta.capi_lead_sent_at) { skipped++; continue; }
        try {
          const r = await sendEventForLead(admin, cfg, lead, 'Lead');
          if (r.ok) {
            sent++;
          } else {
            failed++;
            if (errors.length < 5) {
              const msg = r.meta?.error?.message || r.meta?.error?.error_user_msg || JSON.stringify(r.meta).slice(0, 200);
              errors.push({ lead_id: lead.id, status: r.status, message: msg });
            }
          }
        } catch (e: any) {
          console.error('backfill lead error', lead.id, e);
          failed++;
          if (errors.length < 5) {
            errors.push({ lead_id: lead.id, status: 0, message: e?.message || String(e) });
          }
        }
      }
      return new Response(JSON.stringify({ ok: true, sent, skipped, failed, total: (leads || []).length, errors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -------- Single-event mode --------
    const { workspace_id, lead_id, event_name, booking_id } = bodyReq;
    if (!workspace_id || !lead_id || !event_name) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: cfg } = await admin.from('meta_capi_configs').select('*').eq('workspace_id', workspace_id).maybeSingle();
    if (!cfg || !cfg.enabled) {
      return new Response(JSON.stringify({ skipped: 'no config' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (event_name === 'Lead' && cfg.send_lead === false) {
      return new Response(JSON.stringify({ skipped: 'send_lead disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lead } = await admin.from('leads').select('*').eq('id', lead_id).maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: 'lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const r = await sendEventForLead(admin, cfg, lead, event_name, booking_id);
    return new Response(JSON.stringify({ ok: r.ok, meta: r.meta }), {
      status: r.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[meta-capi] error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
