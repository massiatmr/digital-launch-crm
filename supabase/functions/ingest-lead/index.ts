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

    // ---- Meta attribution signals (CAPI matching) ----
    const pageUrl = String(body.page_url || '').trim().slice(0, 500);
    const fbclid = String(body.fbclid || '').trim().slice(0, 200);
    let fbc = String(body.fbc || '').trim().slice(0, 200);
    const fbp = String(body.fbp || '').trim().slice(0, 200);
    // Reconstruct fbc from fbclid if the cookie wasn't available client-side
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    const clientUserAgent = (req.headers.get('user-agent') || '').slice(0, 500);
    const xff = req.headers.get('x-forwarded-for') || '';
    const clientIp = xff.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';

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

    // ---- Build formatted custom fields block ----
    // Known top-level keys handled separately
    const KNOWN_KEYS = new Set([
      'name', 'email', 'phone', 'message', 'source', 'source_label',
      'offer_slug', 'company_name', 'utm', 'page_url',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fields', 'extra', 'custom', 'data', 'answers',
      // skip keys that are typically a duplicate of `message`
      'note', 'notes', 'body', 'content', 'description', 'comment', 'comments',
      'summary', 'recap', 'recapitulatif', 'récapitulatif', 'details', 'détails',
      'formatted', 'formatted_message', 'raw',
    ]);

    const humanize = (k: string) =>
      k.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

    const formatValue = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join(', ');
      if (typeof v === 'object') {
        try { return JSON.stringify(v); } catch { return String(v); }
      }
      return String(v).trim();
    };

    // Normalize for duplicate detection (strip whitespace + punctuation noise)
    const normalize = (s: string) =>
      s.replace(/[\s━─\-_=*•·.]+/g, ' ').trim().toLowerCase();
    const normalizedMessage = normalize(message);

    const looksLikeFormattedBlock = (s: string) =>
      /━{3,}|─{3,}|={3,}|\*{3,}/.test(s) ||
      // contains 3+ "• Key: value" lines
      (s.match(/^\s*•\s+\S+\s*:/gm)?.length ?? 0) >= 3;

    const isDuplicateOfMessage = (val: string) => {
      if (!normalizedMessage || val.length < 40) return false;
      const n = normalize(val);
      if (!n) return false;
      if (n === normalizedMessage) return true;
      if (n.length >= 80 && normalizedMessage.includes(n)) return true;
      if (normalizedMessage.length >= 80 && n.includes(normalizedMessage)) return true;
      return false;
    };

    // Collect custom fields: from body.fields/extra/custom/data/answers + unknown root keys
    const customEntries: Array<[string, string]> = [];
    const pushEntry = (k: string, v: any) => {
      const val = formatValue(v).slice(0, 1000);
      if (!val) return;
      if (isDuplicateOfMessage(val)) return;
      if (val.length > 200 && looksLikeFormattedBlock(val)) return;
      customEntries.push([humanize(k), val]);
    };

    for (const container of ['fields', 'extra', 'custom', 'data', 'answers']) {
      const obj = body[container];
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) {
          if (KNOWN_KEYS.has(k.toLowerCase())) continue;
          pushEntry(k, v);
        }
      }
    }
    for (const [k, v] of Object.entries(body)) {
      if (KNOWN_KEYS.has(k.toLowerCase())) continue;
      if (v === null || v === undefined || v === '') continue;
      pushEntry(k, v);
    }

    const customBlock = customEntries.length
      ? customEntries.map(([k, v]) => `• ${k}: ${v}`).join('\n')
      : '';

    // ---- UTM / tracking block ----
    const utm = body.utm || {};
    const trackingLines: string[] = [];
    if (sourceLabel) trackingLines.push(`Site: ${sourceLabel}`);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = utm?.[k] ?? body[k];
      if (v) trackingLines.push(`${k}: ${String(v).slice(0, 100)}`);
    }
    if (body.page_url) trackingLines.push(`URL: ${String(body.page_url).slice(0, 300)}`);

    // ---- Compose final message (visible) + notes (mirror) ----
    const sections: string[] = [];
    if (message) sections.push(message);
    if (customBlock) sections.push(`📋 Détails du formulaire\n${customBlock}`);
    if (trackingLines.length) sections.push(`🔗 Provenance\n${trackingLines.join('\n')}`);

    const finalMessage = sections.join('\n\n').slice(0, 8000);

    const attributionMeta: Record<string, any> = {};
    if (fbc) attributionMeta.fbc = fbc;
    if (fbp) attributionMeta.fbp = fbp;
    if (fbclid) attributionMeta.fbclid = fbclid;
    if (pageUrl) attributionMeta.event_source_url = pageUrl;
    if (clientUserAgent) attributionMeta.client_user_agent = clientUserAgent;
    if (clientIp) attributionMeta.client_ip_address = clientIp;

    // ---- Resolve Meta campaign attribution from landing signals ----
    // Priority: explicit body fields > utm_id (numeric) > utm_campaign name lookup in cache
    const isNumericId = (v: any) => typeof v === 'string' && /^\d{6,}$/.test(v.trim());
    let metaCampaignId: string | null = null;
    let metaAdsetId: string | null = null;
    let metaAdId: string | null = null;

    const explicitCampaign = String(body.meta_campaign_id || '').trim();
    const explicitAdset = String(body.meta_adset_id || '').trim();
    const explicitAd = String(body.meta_ad_id || '').trim();
    if (isNumericId(explicitCampaign)) metaCampaignId = explicitCampaign;
    if (isNumericId(explicitAdset)) metaAdsetId = explicitAdset;
    if (isNumericId(explicitAd)) metaAdId = explicitAd;

    const utmId = String((utm as any)?.utm_id ?? body.utm_id ?? '').trim();
    if (!metaCampaignId && isNumericId(utmId)) metaCampaignId = utmId;

    if (!metaCampaignId) {
      const utmCampaign = String((utm as any)?.utm_campaign ?? body.utm_campaign ?? '').trim();
      if (utmCampaign) {
        if (isNumericId(utmCampaign)) {
          metaCampaignId = utmCampaign;
        } else {
          const { data: byName } = await supabase
            .from('meta_campaigns_cache')
            .select('campaign_id')
            .eq('workspace_id', keyRow.workspace_id)
            .ilike('campaign_name', utmCampaign)
            .limit(1)
            .maybeSingle();
          if (byName?.campaign_id) metaCampaignId = byName.campaign_id;
        }
      }
    }

    const leadPayload: Record<string, any> = {
      name: name || email || phone,
      email,
      phone,
      message: finalMessage,
      source,
      status: 'new',
      score: 'warm',
      owner_id: ownerRow.user_id,
      workspace_id: keyRow.workspace_id,
      notes: '',
      company_name: companyName,
      metadata: attributionMeta,
    };
    if (offerId) leadPayload.offer_id = offerId;
    if (metaCampaignId) leadPayload.meta_campaign_id = metaCampaignId;
    if (metaAdsetId) leadPayload.meta_adset_id = metaAdsetId;
    if (metaAdId) leadPayload.meta_ad_id = metaAdId;


    // ---- Dédup : email exact, puis téléphone (9 derniers chiffres), puis nom récent (24h) ----
    let existingLeadId: string | null = null;

    if (email) {
      const { data: byEmail } = await supabase
        .from('leads')
        .select('id')
        .eq('workspace_id', keyRow.workspace_id)
        .eq('email', email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byEmail) existingLeadId = byEmail.id;
    }

    if (!existingLeadId && phone) {
      const tail = phone.replace(/[^0-9]/g, '').slice(-9);
      if (tail.length >= 8) {
        const { data: byPhone } = await supabase
          .from('leads')
          .select('id')
          .eq('workspace_id', keyRow.workspace_id)
          .ilike('phone', `%${tail}%`)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byPhone) existingLeadId = byPhone.id;
      }
    }

    if (!existingLeadId && name && name.trim().length >= 3) {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: byName } = await supabase
        .from('leads')
        .select('id')
        .eq('workspace_id', keyRow.workspace_id)
        .ilike('name', name.trim())
        .is('deleted_at', null)
        .gte('created_at', since24h)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byName) existingLeadId = byName.id;
    }

    let lead: { id: string } | null = null;

    if (existingLeadId) {
      // Enrichir le lead existant sans écraser ni dupliquer
      const enrich: Record<string, any> = { updated_at: new Date().toISOString() };

      const { data: cur } = await supabase
        .from('leads')
        .select('email, phone, company_name, offer_id, message, notes, metadata')
        .eq('id', existingLeadId)
        .maybeSingle();

      if (email && !cur?.email) enrich.email = email;
      if (phone && !cur?.phone) enrich.phone = phone;
      if (companyName && !cur?.company_name) enrich.company_name = companyName;
      if (offerId && !cur?.offer_id) enrich.offer_id = offerId;

      // Fusionne les signaux Meta reçus dans metadata, sans écraser les valeurs déjà présentes.
      const curMeta = (cur?.metadata || {}) as Record<string, any>;
      const mergedMeta: Record<string, any> = { ...curMeta };
      for (const [k, v] of Object.entries(attributionMeta)) {
        if (v && !mergedMeta[k]) mergedMeta[k] = v;
      }
      if (Object.keys(mergedMeta).length !== Object.keys(curMeta).length) {
        enrich.metadata = mergedMeta;
      }

      // Ne garder dans le bonus que les lignes qui ne sont PAS déjà présentes
      // dans le message d'origine OU les notes existantes.
      const haystack = `${cur?.message || ''}\n${cur?.notes || ''}`;
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const haystackNorm = normalize(haystack);

      const newLines: string[] = [];
      for (const rawLine of finalMessage.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        // skip headers répétés
        if (/^(📋|🔗)/.test(line)) continue;
        const norm = normalize(line);
        if (norm.length < 3) continue;
        if (haystackNorm.includes(norm)) continue;
        // anti-doublon intra-batch
        if (newLines.some(l => normalize(l) === norm)) continue;
        newLines.push(rawLine);
      }

      if (newLines.length) {
        const stamp = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
        const block = `\n\n— Nouveau signal (${stamp}, ${source}) —\n${newLines.join('\n')}`;
        enrich.notes = ((cur?.notes || '') + block).slice(0, 16000);
      }

      const { data: updated, error: updErr } = await supabase
        .from('leads')
        .update(enrich)
        .eq('id', existingLeadId)
        .select('id')
        .single();
      if (updErr) {
        console.error('update existing lead failed', updErr);
      }
      lead = updated ?? { id: existingLeadId };
      console.log('ingest-lead: deduped to existing lead', { existingLeadId, newLines: newLines.length });
    } else {

      const { data: created, error: insertErr } = await supabase
        .from('leads')
        .insert(leadPayload)
        .select('id')
        .single();

      if (insertErr) {
        console.error('insert lead error', insertErr);
        return new Response(JSON.stringify({
          error: 'insert_failed',
          code: (insertErr as any).code,
          details: insertErr.message,
          hint: (insertErr as any).hint,
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      lead = created;
    }

    await supabase
      .from('workspace_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id);

    // Fire push + email notification UNIQUEMENT pour les nouveaux leads (pas les dédup).
    if (!existingLeadId) {
      try {
        await supabase.functions.invoke('notify-new-lead', {
          body: { lead_id: lead.id },
        });
      } catch (notifyErr) {
        console.error('notify-new-lead invocation failed', notifyErr);
      }

      // Fire Meta CAPI "Lead" event for attribution (fire-and-forget).
      try {
        await supabase.functions.invoke('meta-capi-send', {
          body: {
            workspace_id: keyRow.workspace_id,
            lead_id: lead.id,
            event_name: 'Lead',
          },
        });
      } catch (capiErr) {
        console.error('meta-capi-send Lead invocation failed', capiErr);
      }
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
