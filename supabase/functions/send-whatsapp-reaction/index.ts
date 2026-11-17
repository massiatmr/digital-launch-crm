// Envoi d'une réaction emoji sur un message WhatsApp.
// Body: { lead_id, wa_message_id, emoji } (emoji vide = retirer la réaction)
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { lead_id, wa_message_id, emoji } = await req.json();
    if (!lead_id || !wa_message_id) {
      return new Response(JSON.stringify({ error: "Missing lead_id or wa_message_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    let errorMessage: string | null = null;

    if (!dryRun) {
      let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
      if (lead.workspace_id) configQuery = configQuery.eq("workspace_id", lead.workspace_id);
      else configQuery = configQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
      const { data: config } = await configQuery.maybeSingle();
      if (!config) errorMessage = "WhatsApp non configuré";
      else {
        const phone = normalizePhone(lead.phone);
        if (!phone) errorMessage = "Téléphone invalide";
        else {
          const resp = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: phone,
              type: "reaction",
              reaction: { message_id: wa_message_id, emoji: emoji || "" },
            }),
          });
          if (!resp.ok) errorMessage = await resp.text();
        }
      }
    }

    // MAJ locale des réactions sur le message ciblé
    const { data: target } = await admin.from("whatsapp_messages")
      .select("id, reactions")
      .eq("wa_message_id", wa_message_id)
      .eq("lead_id", lead.id)
      .maybeSingle();
    if (target) {
      const list = Array.isArray((target as any).reactions) ? [...(target as any).reactions] : [];
      // remove existing reaction by this user
      const filtered = list.filter((r: any) => r.by !== user.id);
      if (emoji) filtered.push({ emoji, by: user.id, at: new Date().toISOString() });
      await (admin.from("whatsapp_messages") as any).update({ reactions: filtered }).eq("id", (target as any).id);
    }

    return new Response(JSON.stringify({ success: !errorMessage, dry_run: dryRun, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-whatsapp-reaction error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
