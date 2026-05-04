// Initie un appel WhatsApp sortant via la Calling API (beta Meta).
// Body: { lead_id, sdp_offer }
// Retourne: { call_id, sdp_answer, fallback?: 'tel' }
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

    const { lead_id, sdp_offer } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: "Missing lead_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const phone = normalizePhone((lead as any).phone);
    if (!phone) return new Response(JSON.stringify({ error: "Téléphone du lead invalide", fallback: "tel" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Récupère config WA
    let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
    if ((lead as any).workspace_id) configQuery = configQuery.eq("workspace_id", (lead as any).workspace_id);
    else configQuery = configQuery.eq("owner_id", (lead as any).owner_id).is("workspace_id", null);
    const { data: config } = await configQuery.maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ error: "WhatsApp non configuré", fallback: "tel", phone }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // Insert call record (status ringing)
    const { data: callRow } = await admin.from("whatsapp_calls").insert({
      lead_id,
      owner_id: user.id,
      workspace_id: (lead as any).workspace_id ?? null,
      direction: "outbound",
      status: "ringing",
    } as any).select("id").single();

    // Tente l'appel via Calling API (beta Meta)
    try {
      const resp = await fetch(`${GRAPH}/${(config as any).phone_number_id}/call`, {
        method: "POST",
        headers: { Authorization: `Bearer ${(config as any).access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          action: "connect",
          session: sdp_offer ? { sdp_type: "offer", sdp: sdp_offer } : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        // Calling API non activée → fallback tel
        await (admin.from("whatsapp_calls") as any).update({ status: "failed", ended_at: new Date().toISOString(), notes: JSON.stringify(data) }).eq("id", (callRow as any).id);
        return new Response(JSON.stringify({ fallback: "tel", phone, error: "Calling API indisponible (activation Meta requise)", details: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }

      const callId = data?.calls?.[0]?.id || data?.call?.id || null;
      const sdpAnswer = data?.session?.sdp || null;
      await (admin.from("whatsapp_calls") as any).update({ wa_call_id: callId }).eq("id", (callRow as any).id);

      return new Response(JSON.stringify({ call_id: callId, db_id: (callRow as any).id, sdp_answer: sdpAnswer }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      await (admin.from("whatsapp_calls") as any).update({ status: "failed", ended_at: new Date().toISOString(), notes: String(e) }).eq("id", (callRow as any).id);
      return new Response(JSON.stringify({ fallback: "tel", phone, error: "Calling API exception" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
  } catch (e) {
    console.error("whatsapp-call-initiate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
