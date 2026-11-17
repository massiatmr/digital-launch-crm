import { isServiceRoleRequest } from "../_shared/internalAuth.ts";
// Génère un résumé 1-ligne d'un transcript vocal — appelé après transcription du webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!(await isServiceRoleRequest(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { message_id } = await req.json();
    if (!message_id) return new Response(JSON.stringify({ error: "message_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: msg } = await admin.from("whatsapp_messages").select("id, transcript, content, summary_oneline").eq("id", message_id).maybeSingle();
    if (!msg) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if ((msg as any).summary_oneline) return new Response(JSON.stringify({ ok: true, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const text = (msg as any).transcript || (msg as any).content;
    if (!text || text === "[Vocal]") return new Response(JSON.stringify({ ok: false, reason: "no transcript" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "AI missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const resp = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Tu résumes un message vocal WhatsApp en UNE ligne très courte (max 80 caractères) qui capture l'essentiel (intention/demande/info). Pas de ponctuation finale. Français." },
          { role: "user", content: text.slice(0, 2000) },
        ],
      }),
    });
    const json = await resp.json();
    const summary = (json?.choices?.[0]?.message?.content || "").trim().slice(0, 120);
    if (summary) {
      await (admin.from("whatsapp_messages") as any).update({ summary_oneline: summary }).eq("id", message_id);
    }
    return new Response(JSON.stringify({ ok: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("summarize-voice error", e);
    return new Response(JSON.stringify({ error: "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
