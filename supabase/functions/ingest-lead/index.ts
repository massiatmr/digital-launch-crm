import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // FR: 0XXXXXXXXX -> +33XXXXXXXXX
  if (/^0\d{9}$/.test(digits)) return '+33' + digits.slice(1);
  return digits;
}

const VALID_SOURCES = ['facebook', 'website', 'google_sheets', 'manual', 'other', 'organic_social', 'recommendation', 'google_my_business', 'whatsapp'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const apiKey = req.headers.get('x-api-key') || '';
    if (!apiKey || apiKey.length < 20) {
      return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const name = String(body.name || '').trim().slice(0, 200);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 255);
    const phoneRaw = String(body.phone || '').trim().slice(0, 50);
    const message = String(body.message || '').trim().slice(0, 4000);
    const sourceRaw = String(body.source || 'website').trim();
    const source = VALID_SOURCES.includes(sourceRaw) ? sourceRaw : 'website';
    const sourceLabel = String(body.source_label || (sourceRaw && !VALID_SOURCES.includes(sourceRaw) ? sourceRaw : '')).trim().slice(0, 100);
    const offerSlug = String(body.offer_slug || '').trim().slice(0, 200);
    const companyName = String(body.company_name || '').trim().slice(0, 200);
    const phone = normalizePhone(phoneRaw);

    if (!name && !email && !phone) {
      return new Response(JSON.stringify({ error: 'missing_contact', detail: 'name, email or phone required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('id, workspace_id, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (!keyRow || keyRow.revoked_at) {
      return new Response(JSON.stringify({ error: 'invalid_api_key' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Owner of workspace
    const { data: ownerRow } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', keyRow.workspace_id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    if (!ownerRow) {
      return new Response(JSON.stringify({ error: 'workspace_no_owner' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Optional offer mapping
    let offerId: string | null = null;
    if (offerSlug) {
      const { data: offerRow } = await supabase
        .from('offers')
        .select('id')
        .eq('workspace_id', keyRow.workspace_id)
        .eq('slug', offerSlug)
        .is('deleted_at', null)
        .maybeSingle();
      if (offerRow) offerId = offerRow.id;
    }

    // Build notes with extra context
    const extras: string[] = [];
    if (sourceLabel) extras.push(`Site: ${sourceLabel}`);
    const utm = body.utm || {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (utm?.[k]) extras.push(`${k}: ${String(utm[k]).slice(0, 100)}`);
      else if (body[k]) extras.push(`${k}: ${String(body[k]).slice(0, 100)}`);
    }
    if (body.page_url) extras.push(`URL: ${String(body.page_url).slice(0, 300)}`);
    const notes = extras.join('\n');

    const leadPayload: Record<string, any> = {
      name: name || email || phone,
      email,
      phone,
      message,
      source,
      status: 'new',
      score: 'warm',
      owner_id: ownerRow.user_id,
      workspace_id: keyRow.workspace_id,
      notes,
      company_name: companyName,
    };
    if (offerId) leadPayload.offer_id = offerId;

    const { data: lead, error: insertErr } = await supabase
      .from('leads')
      .insert(leadPayload)
      .select('id')
      .single();

    if (insertErr) {
      console.error('insert lead error', insertErr);
      return new Response(JSON.stringify({ error: 'insert_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase
      .from('workspace_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id);

    // Fire push + email notification (same as Facebook Lead Ads flow)
    try {
      await supabase.functions.invoke('notify-new-lead', {
        body: { lead_id: lead.id },
      });
    } catch (notifyErr) {
      console.error('notify-new-lead invocation failed', notifyErr);
    }

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ingest-lead error', e);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
