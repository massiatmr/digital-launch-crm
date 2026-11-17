// Matérialise les destinataires d'une campagne WhatsApp et la passe en running/scheduled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { templateGreetingName } from "../_shared/whatsappPersonalization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RECIPIENTS = 5000;

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p.replace(/^\+/, "");
}

function resolveVars(mapping: Record<string, string>, source: any, body = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [idx, field] of Object.entries(mapping || {})) {
    let val = "";
    if (field?.startsWith("static:")) val = field.slice(7);
    else if (field === "name") val = templateGreetingName(source?.name, source?.company_name, body);
    else val = String(source?.[field] ?? "").trim();
    if (!val) val = templateGreetingName(source?.name, source?.company_name, body);
    out[idx] = val;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { campaign_id, manual_recipients } = await req.json();
    if (!campaign_id) return new Response(JSON.stringify({ error: "Missing campaign_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Charge la campagne (via supabase user-scoped → RLS check)
    const { data: campaign, error: cErr } = await supabase.from("campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (cErr || !campaign) return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return new Response(JSON.stringify({ error: "Campaign already launched" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!campaign.template_name) {
      return new Response(JSON.stringify({ error: "Aucun template sélectionné" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Vérifie config WhatsApp
    let cfgQ = admin.from("whatsapp_config").select("id, status, phone_number_id").eq("is_active", true);
    if (campaign.workspace_id) cfgQ = cfgQ.eq("workspace_id", campaign.workspace_id);
    else cfgQ = cfgQ.eq("owner_id", campaign.owner_id).is("workspace_id", null);
    const { data: cfg } = await cfgQ.maybeSingle();
    if (!cfg || !cfg.phone_number_id) {
      return new Response(JSON.stringify({ error: "WhatsApp non configuré pour ce workspace" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Construit la liste cible
    const f = campaign.audience_filter || {};
    let contacts: Array<{ lead_id?: string; client_id?: string; phone: string; name: string; source: any }> = [];

    if (campaign.audience_mode === "manual") {
      const list = Array.isArray(manual_recipients) ? manual_recipients : [];
      // Récupère les enregistrements par lots
      const leadIds = list.filter((r: any) => r.kind === "lead").map((r: any) => r.id);
      const clientIds = list.filter((r: any) => r.kind === "client").map((r: any) => r.id);
      if (leadIds.length) {
        let mq = admin.from("leads").select("*").in("id", leadIds).is("deleted_at", null);
        mq = campaign.workspace_id ? mq.eq("workspace_id", campaign.workspace_id) : mq.eq("owner_id", campaign.owner_id).is("workspace_id", null);
        const { data } = await mq;
        for (const l of data || []) {
          const ph = normalizePhone(l.phone);
          if (ph) contacts.push({ lead_id: l.id, phone: ph, name: l.name, source: l });
        }
      }
      if (clientIds.length) {
        let mq = admin.from("clients").select("*").in("id", clientIds).is("deleted_at", null);
        mq = campaign.workspace_id ? mq.eq("workspace_id", campaign.workspace_id) : mq.eq("owner_id", campaign.owner_id).is("workspace_id", null);
        const { data } = await mq;
        for (const c of data || []) {
          const ph = normalizePhone(c.phone);
          if (ph) contacts.push({ client_id: c.id, phone: ph, name: c.name, source: c });
        }
      }
    } else {
      // Mode filtre : on relit avec le service role en appliquant les filtres workspace
      const entity = f.entity || "leads";
      if (entity === "leads" || entity === "both") {
        let q = admin.from("leads").select("*").is("deleted_at", null).not("phone", "is", null).neq("phone", "");
        if (campaign.workspace_id) q = q.eq("workspace_id", campaign.workspace_id);
        else q = q.eq("owner_id", campaign.owner_id);
        if (f.lead_statuses?.length) q = q.in("status", f.lead_statuses);
        if (f.scores?.length) q = q.in("score", f.scores);
        if (f.sources?.length) q = q.in("source", f.sources);
        if (f.offer_ids?.length) q = q.in("offer_id", f.offer_ids);
        if (f.never_contacted) q = q.is("last_contacted_at", null);
        if (f.no_reply_days && f.no_reply_days > 0) {
          const cutoff = new Date(Date.now() - f.no_reply_days * 86400000).toISOString();
          q = q.lt("last_contacted_at", cutoff);
        }
        const { data } = await q.limit(MAX_RECIPIENTS);
        for (const l of data || []) {
          const ph = normalizePhone(l.phone);
          if (ph) contacts.push({ lead_id: l.id, phone: ph, name: l.name, source: l });
        }
      }
      if (entity === "clients" || entity === "both") {
        let q = admin.from("clients").select("*").is("deleted_at", null).not("phone", "is", null).neq("phone", "");
        if (campaign.workspace_id) q = q.eq("workspace_id", campaign.workspace_id);
        else q = q.eq("owner_id", campaign.owner_id);
        if (f.client_statuses?.length) q = q.in("status", f.client_statuses);
        const { data } = await q.limit(MAX_RECIPIENTS);
        for (const c of data || []) {
          const ph = normalizePhone(c.phone);
          if (ph) contacts.push({ client_id: c.id, phone: ph, name: c.name, source: c });
        }
      }
    }

    // Déduplique par téléphone
    const dedup = new Map<string, typeof contacts[0]>();
    for (const c of contacts) if (!dedup.has(c.phone)) dedup.set(c.phone, c);
    contacts = Array.from(dedup.values()).slice(0, MAX_RECIPIENTS);

    if (contacts.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun destinataire trouvé" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert recipients en chunks
    const { data: campaignTemplate } = await supabase.from("whatsapp_templates")
      .select("body_text").eq("name", campaign.template_name).eq("language", campaign.template_language || "fr").limit(1).maybeSingle();
    const rows = contacts.map((c) => ({
      campaign_id,
      lead_id: c.lead_id ?? null,
      client_id: c.client_id ?? null,
      phone: c.phone,
      contact_name: c.name,
      resolved_variables: resolveVars(campaign.template_variables_mapping || {}, c.source, campaignTemplate?.body_text || ""),
      status: "pending" as const,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await admin.from("campaign_recipients").upsert(chunk as any, { onConflict: "campaign_id,phone", ignoreDuplicates: true });
    }

    const nowIso = new Date().toISOString();
    const scheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString() : null;
    const isScheduledFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 30_000;

    await admin.from("campaigns").update({
      total_recipients: rows.length,
      status: isScheduledFuture ? "scheduled" : "running",
      started_at: isScheduledFuture ? null : nowIso,
    } as any).eq("id", campaign_id);

    // Si pas planifié → kick le processor en fire-and-forget
    if (!isScheduledFuture) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${SUPABASE_URL}/functions/v1/campaigns-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SRK}` },
        body: JSON.stringify({ campaign_id }),
      }).catch((e) => console.error("campaigns-process invoke failed:", e));
    }

    return new Response(JSON.stringify({ success: true, total_recipients: rows.length, scheduled: !!isScheduledFuture }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("campaigns-launch error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
