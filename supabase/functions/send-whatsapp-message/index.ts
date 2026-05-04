// Envoie un message WhatsApp texte libre à un lead (hors séquence)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p.replace(/^\+/, "");
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

    const { lead_id, message, reply_to_wa_id } = await req.json();
    if (!lead_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing lead_id or message" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await admin.from("followup_automation_settings").select("dry_run").eq("owner_id", user.id).maybeSingle();
    const dryRun = settings?.dry_run !== false;

    let waMessageId: string | null = null;
    let errorMessage: string | null = null;
    let logStatus = dryRun ? "dry_run" : "sent";

    if (!dryRun) {
      // Scoper la config WhatsApp au workspace du lead (pas l'owner courant)
      let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
      if (lead.workspace_id) {
        configQuery = configQuery.eq("workspace_id", lead.workspace_id);
      } else {
        configQuery = configQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
      }
      const { data: config } = await configQuery.maybeSingle();
      if (!config) {
        errorMessage = "WhatsApp non configuré";
        logStatus = "failed";
      } else {
        const phone = normalizePhone(lead.phone);
        if (!phone) {
          errorMessage = "Téléphone du lead invalide";
          logStatus = "failed";
        } else {
          const payload: any = {
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: message },
          };
          if (reply_to_wa_id) payload.context = { message_id: reply_to_wa_id };
          const resp = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json();
          if (!resp.ok) { errorMessage = JSON.stringify(data); logStatus = "failed"; }
          else { waMessageId = data.messages?.[0]?.id || null; logStatus = "sent"; }
        }
      }
    }

    // Snapshot du message cité (pour affichage immédiat dans la bulle reply)
    let replySnapshot: any = null;
    if (reply_to_wa_id) {
      const { data: orig } = await admin.from("whatsapp_messages")
        .select("content, direction, message_type")
        .eq("wa_message_id", reply_to_wa_id).maybeSingle();
      if (orig) {
        replySnapshot = {
          wa_id: reply_to_wa_id,
          direction: (orig as any).direction,
          excerpt: ((orig as any).content || "").slice(0, 120),
          type: (orig as any).message_type,
        };
      }
    }

    await admin.from("whatsapp_messages").insert({
      lead_id,
      owner_id: user.id,
      workspace_id: lead.workspace_id ?? null,
      direction: 'outbound',
      content: message,
      message_type: 'text',
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
      reply_to_wa_id: reply_to_wa_id ?? null,
      reply_to_snapshot: replySnapshot,
    } as any);

    return new Response(JSON.stringify({ success: logStatus !== "failed", dry_run: dryRun, status: logStatus, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-whatsapp-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
