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

    const { lead_id, message, reply_to_wa_id, template } = await req.json();
    // template: { name, language, variables: string[] }  → envoi template HSM (hors fenêtre 24h)
    if (!lead_id || (!template && !message?.trim())) {
      return new Response(JSON.stringify({ error: "Missing lead_id or message/template" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await admin
        .from("followup_automation_settings")
        .select("dry_run")
        .eq("workspace_id", lead.workspace_id)
        .maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await admin
        .from("followup_automation_settings")
        .select("dry_run")
        .eq("owner_id", user.id)
        .is("workspace_id", null)
        .maybeSingle();
      settings = data;
    }
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
          let payload: any;
          if (template) {
            const vars = Array.isArray(template.variables) ? template.variables : [];
            payload = {
              messaging_product: "whatsapp",
              to: phone,
              type: "template",
              template: {
                name: template.name,
                language: { code: template.language || "fr" },
                ...(vars.length > 0 ? {
                  components: [{
                    type: "body",
                    parameters: vars.map((v: string) => ({ type: "text", text: String(v) })),
                  }],
                } : {}),
              },
            };
          } else {
            payload = {
              messaging_product: "whatsapp",
              to: phone,
              type: "text",
              text: { body: message },
            };
            if (reply_to_wa_id) payload.context = { message_id: reply_to_wa_id };
          }
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

    // Pour un envoi template, on stocke un texte rendu lisible (template:nom + variables)
    let storedContent = message || "";
    let storedType = "text";
    if (template) {
      storedType = "template";
      const vars = Array.isArray(template.variables) ? template.variables : [];
      storedContent = `[Template: ${template.name}]${vars.length ? ` ${vars.join(" | ")}` : ""}`;
    }

    await admin.from("whatsapp_messages").insert({
      lead_id,
      owner_id: user.id,
      workspace_id: lead.workspace_id ?? null,
      direction: 'outbound',
      content: storedContent,
      message_type: storedType,
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
      reply_to_wa_id: reply_to_wa_id ?? null,
      reply_to_snapshot: replySnapshot,
      metadata: { sent_by_user: true },
    } as any);

    // Au premier outbound réussi, basculer le lead "new" → "contacted"
    if (logStatus === "sent" && lead.status === "new") {
      await admin.from("leads").update({ status: "contacted", last_contacted_at: new Date().toISOString() } as any).eq("id", lead_id);
    }

    // Détection auto de RDV confirmé après outbound manuel (fire-and-forget).
    // Couvre le cas où l'utilisateur tape lui-même la confirmation dans WhatsAppChat.
    if (logStatus === "sent") {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${SUPABASE_URL}/functions/v1/detect-booking-from-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SRK}` },
        body: JSON.stringify({ lead_id }),
      }).catch((e) => console.error("detect-booking invoke failed:", e));
    }

    return new Response(JSON.stringify({ success: logStatus !== "failed", dry_run: dryRun, status: logStatus, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-whatsapp-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
