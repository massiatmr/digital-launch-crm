// Processeur de campagnes WhatsApp : envoie les templates HSM aux destinataires pending.
// Appelé soit en fire-and-forget par campaigns-launch, soit via cron chaque minute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const BATCH_SIZE = 40;
const SEND_DELAY_MS = 250; // ~4 msg/sec → confortable vs limites Meta

async function processCampaign(admin: any, campaign_id: string) {
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", campaign_id).maybeSingle();
  if (!campaign) return { skipped: "not_found" };
  if (campaign.status === "completed" || campaign.status === "cancelled" || campaign.status === "failed") {
    return { skipped: "already_done" };
  }
  if (campaign.status === "scheduled") {
    if (!campaign.scheduled_at || new Date(campaign.scheduled_at).getTime() > Date.now()) return { skipped: "not_due" };
    await admin.from("campaigns").update({ status: "running", started_at: new Date().toISOString() } as any).eq("id", campaign_id);
  }

  // Charge config WhatsApp
  let cfgQ = admin.from("whatsapp_config").select("*").eq("is_active", true);
  if (campaign.workspace_id) cfgQ = cfgQ.eq("workspace_id", campaign.workspace_id);
  else cfgQ = cfgQ.eq("owner_id", campaign.owner_id).is("workspace_id", null);
  const { data: cfg } = await cfgQ.maybeSingle();
  if (!cfg) {
    await admin.from("campaigns").update({ status: "failed", error_message: "WhatsApp non configuré", finished_at: new Date().toISOString() } as any).eq("id", campaign_id);
    return { error: "no_config" };
  }

  // Récupère un batch de destinataires pending
  const { data: recipients } = await admin
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaign_id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  let sent = 0, failed = 0;

  for (const r0 of recipients || []) {
    // Verrou atomique : un seul processus (lancement ou cron) peut réclamer ce destinataire.
    const { data: claimed } = await admin
      .from("campaign_recipients")
      .update({ attempts: (r0.attempts || 0) + 1 } as any)
      .eq("id", r0.id)
      .eq("status", "pending")
      .eq("attempts", r0.attempts || 0)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    const r = { ...r0, attempts: r0.attempts || 0 };
    try {
      const vars = r.resolved_variables || {};
      const ordered = Object.keys(vars).sort((a, b) => Number(a) - Number(b)).map((k) => vars[k]);
      const payload: any = {
        messaging_product: "whatsapp",
        to: r.phone,
        type: "template",
        template: {
          name: campaign.template_name,
          language: { code: campaign.template_language || "fr" },
          ...(ordered.length > 0 ? {
            components: [{
              type: "body",
              parameters: ordered.map((v: string) => ({ type: "text", text: String(v || "") })),
            }],
          } : {}),
        },
      };
      const resp = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(JSON.stringify(data));

      const waId = data.messages?.[0]?.id || null;

      // Trace dans whatsapp_messages si lead_id
      let waMsgRow: any = null;
      if (r.lead_id) {
        const { data: inserted } = await admin.from("whatsapp_messages").insert({
          lead_id: r.lead_id,
          owner_id: campaign.owner_id,
          workspace_id: campaign.workspace_id,
          direction: "outbound",
          content: `[Campagne: ${campaign.name}] ${campaign.template_name}`,
          message_type: "template",
          status: "sent",
          wa_message_id: waId,
          metadata: { campaign_id, sent_by_user: false },
        } as any).select("id").maybeSingle();
        waMsgRow = inserted;
      }

      await admin.from("campaign_recipients").update({
        status: "sent",
        wa_message_id: waId,
        whatsapp_message_id: waMsgRow?.id ?? null,
        sent_at: new Date().toISOString(),
        attempts: (r.attempts || 0) + 1,
      } as any).eq("id", r.id);
      sent++;
    } catch (e: any) {
      const errMsg = e?.message ? String(e.message).slice(0, 500) : "Unknown error";
      await admin.from("campaign_recipients").update({
        status: "failed",
        error_message: errMsg,
        attempts: (r.attempts || 0) + 1,
      } as any).eq("id", r.id);
      failed++;
    }
    if (SEND_DELAY_MS > 0) await new Promise((res) => setTimeout(res, SEND_DELAY_MS));
  }

  // Recalcule compteurs et statut
  const { data: counts } = await admin
    .from("campaign_recipients")
    .select("status")
    .eq("campaign_id", campaign_id);
  const tally = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 };
  for (const row of counts || []) {
    const s = (row as any).status as keyof typeof tally;
    if (s in tally) tally[s]++;
  }
  const isDone = tally.pending === 0;
  await admin.from("campaigns").update({
    sent_count: tally.sent + tally.delivered + tally.read,
    delivered_count: tally.delivered + tally.read,
    read_count: tally.read,
    failed_count: tally.failed,
    skipped_count: tally.skipped,
    status: isDone ? "completed" : "running",
    finished_at: isDone ? new Date().toISOString() : null,
  } as any).eq("id", campaign_id);

  return { sent, failed, remaining: tally.pending };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let campaign_id: string | undefined;
    try { campaign_id = (await req.json())?.campaign_id; } catch { /* cron call: no body */ }

    let processed: any[] = [];
    if (campaign_id) {
      processed.push({ campaign_id, ...(await processCampaign(admin, campaign_id)) });
    } else {
      // Mode cron : tous les campaigns running + scheduled échus
      const nowIso = new Date().toISOString();
      const { data: due } = await admin
        .from("campaigns")
        .select("id")
        .is("deleted_at", null)
        .or(`status.eq.running,and(status.eq.scheduled,scheduled_at.lte.${nowIso})`)
        .limit(20);
      for (const c of due || []) {
        processed.push({ campaign_id: c.id, ...(await processCampaign(admin, c.id)) });
      }
    }
    return new Response(JSON.stringify({ success: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("campaigns-process error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
