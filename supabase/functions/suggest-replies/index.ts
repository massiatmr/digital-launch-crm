// Generate 3 contextual reply suggestions for a WhatsApp conversation using Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { lead_id } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: "lead_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: lead }, { data: messages }, { data: qual }] = await Promise.all([
      supabase.from("leads").select("name, company_name, message, notes, owner_id, workspace_id").eq("id", lead_id).maybeSingle(),
      supabase.from("whatsapp_messages").select("direction, content, transcript, sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: false }).limit(12),
      supabase.from("lead_qualification").select("intent, pain_point, urgency, objections, summary").eq("lead_id", lead_id).maybeSingle(),
    ]);

    // Settings pour prompt + modèle custom
    let settings: any = null;
    if (lead?.workspace_id) {
      const { data } = await supabase.from("followup_automation_settings").select("suggest_replies_system_prompt, suggest_replies_model").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings && lead?.owner_id) {
      const { data } = await supabase.from("followup_automation_settings").select("suggest_replies_system_prompt, suggest_replies_model").eq("owner_id", lead.owner_id).is("workspace_id", null).maybeSingle();
      settings = data;
    }

    const history = (messages ?? []).reverse().map((m: any) => {
      const who = m.direction === "inbound" ? "LEAD" : "MOI";
      return `${who}: ${m.transcript || m.content}`;
    }).join("\n");

    const DEFAULT_SUGGEST_PROMPT = `Tu es un closer humain et direct, expert en vente B2B. Tu écris en français, ton conversationnel et naturel, comme sur WhatsApp.
Tu génères 3 propositions de réponse COURTES (max 2 phrases / 200 caractères) au dernier message du LEAD, avec 3 angles différents :
1. Une réponse qui POUSSE vers la prise de RDV / closing
2. Une réponse qui QUALIFIE davantage (pose une question)
3. Une réponse qui RASSURE / lève une objection (ou propose un middle ground)

STYLE OBLIGATOIRE :
- Ton naturel, parlé, fluide. Pas de formules corporate.
- INTERDIT : tirets cadratins (— ou –), emojis, ponctuation excessive (!!!, ???, ...), majuscules pour insister.
- Pas de "n'hésite pas", "je reste à disposition", "je me permets".
- RÈGLE ABSOLUE : MAX 1 QUESTION par suggestion. Jamais 2 questions enchaînées dans la même réponse, même implicites (ex INTERDIT : "Tu es satisfait ou tu veux passer un cap. Tu bosses en équipe ou en solo ?"). Compte les "?" : 0 ou 1, jamais 2.

Réponds UNIQUEMENT avec un JSON: {"suggestions": ["réponse 1", "réponse 2", "réponse 3"]}`;
    const sys = (settings?.suggest_replies_system_prompt?.trim()) || DEFAULT_SUGGEST_PROMPT;

    const userPrompt = `LEAD: ${lead?.name ?? "?"}${lead?.company_name ? ` (${lead.company_name})` : ""}
${qual?.summary ? `Résumé qualif: ${qual.summary}\n` : ""}${qual?.pain_point ? `Pain: ${qual.pain_point}\n` : ""}${qual?.urgency ? `Urgence: ${qual.urgency}\n` : ""}${Array.isArray(qual?.objections) && qual.objections.length ? `Objections: ${(qual.objections as any[]).join(', ')}\n` : ""}
Message initial du lead: ${lead?.message ?? "-"}

Conversation récente :
${history}

Génère 3 suggestions de réponse au DERNIER message du LEAD.`;

    const resp = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings?.suggest_replies_model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: "AI failed", detail: txt.slice(0, 200) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { suggestions: [] }; }

    return new Response(JSON.stringify({ suggestions: parsed.suggestions ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("suggest-replies error", e);
    return new Response(JSON.stringify({ error: "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
