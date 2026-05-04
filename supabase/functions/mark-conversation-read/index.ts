// Marque tous les messages inbound non lus d'un lead comme "read" (côté CRM + side-effect Meta)
// Body: { lead_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { lead_id } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: "Missing lead_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: lead } = await supabase.from("leads").select("workspace_id, owner_id").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Récupère les messages inbound non lus
    const { data: msgs } = await admin
      .from("whatsapp_messages")
      .select("id, wa_message_id")
      .eq("lead_id", lead_id)
      .eq("direction", "inbound")
      .is("read_at", null);

    const ids = (msgs || []).map((m: any) => m.id);
    if (ids.length === 0) return new Response(JSON.stringify({ success: true, marked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Update local
    await (admin.from("whatsapp_messages") as any).update({ read_at: new Date().toISOString() }).in("id", ids);

    // Side-effect Meta : envoyer read receipt sur chaque wa_message_id (best effort)
    let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
    if ((lead as any).workspace_id) configQuery = configQuery.eq("workspace_id", (lead as any).workspace_id);
    else configQuery = configQuery.eq("owner_id", (lead as any).owner_id).is("workspace_id", null);
    const { data: config } = await configQuery.maybeSingle();

    if (config) {
      await Promise.all((msgs || []).filter((m: any) => m.wa_message_id).map(async (m: any) => {
        try {
          await fetch(`${GRAPH}/${(config as any).phone_number_id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${(config as any).access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: m.wa_message_id }),
          });
        } catch (e) { console.warn("read receipt error", e); }
      }));
    }

    return new Response(JSON.stringify({ success: true, marked: ids.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mark-conversation-read error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
