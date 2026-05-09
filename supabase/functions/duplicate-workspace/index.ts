import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

// Helper: clone rows for a workspace-scoped table, returning id remap.
async function cloneTable(
  admin: any,
  table: string,
  filter: { workspace_id: string },
  newWorkspaceId: string,
  ownerId: string,
  remap: Record<string, Record<string, string>>,
  refs: { col: string; from: string }[] = [],
  excludeCols: string[] = [],
) {
  const { data: rows, error } = await admin.from(table).select('*').match(filter);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  if (!rows || rows.length === 0) return;
  const idMap: Record<string, string> = {};
  const hasIdCol = rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id') && !excludeCols.includes('id');
  const inserts = rows.map((row: any) => {
    const next: any = { ...row };
    if (hasIdCol) {
      const newId = crypto.randomUUID();
      if (row.id) idMap[row.id] = newId;
      next.id = newId;
    } else {
      delete next.id;
    }
    next.workspace_id = newWorkspaceId;
    if ('owner_id' in next) next.owner_id = ownerId;
    if ('created_at' in next) delete next.created_at;
    if ('updated_at' in next) delete next.updated_at;
    if ('created_by' in next) next.created_by = ownerId;
    for (const ex of excludeCols) delete next[ex];
    for (const r of refs) {
      const v = next[r.col];
      if (v && remap[r.from] && remap[r.from][v]) next[r.col] = remap[r.from][v];
      else if (v && refs.find((f) => f.col === r.col)?.from) {
        // if reference not found in remap, keep null to avoid cross-workspace leak
        next[r.col] = null;
      }
    }
    return next;
  });
  // bulk insert in chunks of 500
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    const { error: insErr } = await admin.from(table).insert(chunk);
    if (insErr) throw new Error(`insert ${table}: ${insErr.message}`);
  }
  remap[table] = idMap;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const sourceId: string | undefined = body.source_workspace_id;
    if (!sourceId || typeof sourceId !== 'string') return json({ error: 'source_workspace_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is member of source workspace
    const { data: membership } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) return json({ error: 'Forbidden' }, 403);

    // Load source workspace
    const { data: src, error: srcErr } = await admin.from('workspaces').select('*').eq('id', sourceId).single();
    if (srcErr || !src) return json({ error: 'Source not found' }, 404);

    // Build unique slug
    const baseSlug = (src.slug || slugify(src.company_name || 'espace')) + '-copie';
    let finalSlug = baseSlug;
    for (let i = 2; i < 100; i++) {
      const { data: exists } = await admin.from('workspaces').select('id').eq('slug', finalSlug).maybeSingle();
      if (!exists) break;
      finalSlug = `${baseSlug}-${i}`;
    }

    // Create new workspace (clone settings)
    const { id: _id, created_at: _ca, updated_at: _ua, deleted_at: _da, slug: _sl, company_name: _cn, created_by: _cb, ...wsRest } = src;
    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .insert({
        ...wsRest,
        company_name: `${src.company_name || 'Espace'} (copie)`,
        slug: finalSlug,
        created_by: userId,
        onboarding_completed: true,
        deleted_at: null,
      })
      .select()
      .single();
    if (wsErr) throw new Error(`create workspace: ${wsErr.message}`);
    const newWsId = ws.id;

    // Add caller as owner
    const { error: memErr } = await admin
      .from('workspace_members')
      .insert({ workspace_id: newWsId, user_id: userId, role: 'owner' });
    if (memErr) throw new Error(`create membership: ${memErr.message}`);

    const remap: Record<string, Record<string, string>> = {};
    const filter = { workspace_id: sourceId };

    // Order matters: parents first, then children
    // 1. Independent / settings
    await cloneTable(admin, 'workspace_features', filter, newWsId, userId, remap, [], ['id']);
    await cloneTable(admin, 'whatsapp_config', filter, newWsId, userId, remap);
    await cloneTable(admin, 'whatsapp_templates', filter, newWsId, userId, remap);
    await cloneTable(admin, 'meta_pages', filter, newWsId, userId, remap);

    // 2. Offers (referenced by leads/clients/bookings)
    await cloneTable(admin, 'offers', filter, newWsId, userId, remap);

    // 3. Followup config (references templates)
    await cloneTable(admin, 'followup_scripts', filter, newWsId, userId, remap);
    await cloneTable(admin, 'followup_automation_settings', filter, newWsId, userId, remap, [
      { col: 'template_initial_id', from: 'whatsapp_templates' },
      { col: 'template_followup_1_id', from: 'whatsapp_templates' },
      { col: 'template_followup_2_id', from: 'whatsapp_templates' },
      { col: 'template_last_followup_id', from: 'whatsapp_templates' },
      { col: 'template_reactivation_id', from: 'whatsapp_templates' },
    ]);
    await cloneTable(admin, 'followup_sequence_steps', filter, newWsId, userId, remap, [
      { col: 'template_id', from: 'whatsapp_templates' },
    ]);

    // 4. Meta mappings
    await cloneTable(admin, 'meta_form_offer_mapping', filter, newWsId, userId, remap, [
      { col: 'offer_id', from: 'offers' },
    ]);
    await cloneTable(admin, 'meta_campaigns_cache', filter, newWsId, userId, remap);
    await cloneTable(admin, 'meta_campaign_insights_cache', filter, newWsId, userId, remap);

    // 5. Clients (offer_id ref)
    await cloneTable(admin, 'clients', filter, newWsId, userId, remap, [{ col: 'offer_id', from: 'offers' }]);

    // 6. Leads (offer_id ref)
    await cloneTable(admin, 'leads', filter, newWsId, userId, remap, [{ col: 'offer_id', from: 'offers' }]);

    // 7. Bookings (offer_id, lead_id)
    await cloneTable(admin, 'bookings', filter, newWsId, userId, remap, [
      { col: 'offer_id', from: 'offers' },
      { col: 'lead_id', from: 'leads' },
    ]);

    // 8. Client children
    await cloneTable(admin, 'invoices', filter, newWsId, userId, remap, [{ col: 'client_id', from: 'clients' }]);
    await cloneTable(admin, 'contract_signatures', filter, newWsId, userId, remap, [
      { col: 'client_id', from: 'clients' },
    ]);
    await cloneTable(admin, 'client_activities', filter, newWsId, userId, remap, [
      { col: 'client_id', from: 'clients' },
    ]);
    await cloneTable(admin, 'client_resources', filter, newWsId, userId, remap, [
      { col: 'client_id', from: 'clients' },
    ]);

    // 9. Lead children
    await cloneTable(admin, 'lead_activities', filter, newWsId, userId, remap, [{ col: 'lead_id', from: 'leads' }]);
    await cloneTable(admin, 'lead_qualification', filter, newWsId, userId, remap, [
      { col: 'lead_id', from: 'leads' },
    ]);
    await cloneTable(admin, 'lead_followup_tasks', filter, newWsId, userId, remap, [
      { col: 'lead_id', from: 'leads' },
    ]);
    await cloneTable(admin, 'lead_conversation_state', filter, newWsId, userId, remap, [
      { col: 'lead_id', from: 'leads' },
    ]);
    await cloneTable(admin, 'generated_messages', filter, newWsId, userId, remap, [
      { col: 'lead_id', from: 'leads' },
    ]);
    await cloneTable(admin, 'reminders', filter, newWsId, userId, remap, [{ col: 'lead_id', from: 'leads' }]);
    await cloneTable(admin, 'sales_scripts', filter, newWsId, userId, remap, [{ col: 'lead_id', from: 'leads' }]);
    await cloneTable(admin, 'whatsapp_messages', filter, newWsId, userId, remap, [
      { col: 'lead_id', from: 'leads' },
    ]);
    await cloneTable(admin, 'whatsapp_calls', filter, newWsId, userId, remap, [{ col: 'lead_id', from: 'leads' }]);

    return json({ ok: true, workspace: ws });
  } catch (e: any) {
    console.error('duplicate-workspace error:', e);
    return json({ error: e?.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
