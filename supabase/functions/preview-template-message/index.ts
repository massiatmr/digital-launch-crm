// Génère un aperçu d'un message template avec variables remplies via IA pour un lead donné
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { greetingInstructions, normalizeTemplateNameVariables } from "../_shared/whatsappPersonalization.ts";

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

    const { template_id, lead_id, fallback_lead } = await req.json();
    if (!template_id) return new Response(JSON.stringify({ error: "template_id requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: tpl } = await supabase.from("whatsapp_templates").select("*").eq("id", template_id).maybeSingle();
    if (!tpl) return new Response(JSON.stringify({ error: "Template introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let lead = fallback_lead;
    if (lead_id) {
      const { data } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
      if (data) lead = data;
    }
    if (!lead) lead = { name: "Marie Dupont", company_name: "Acme", message: "Demande d'info", notes: "" };

    let preview = tpl.body_text;
    if (tpl.variables_count > 0) {
      const prompt = `Génère ${tpl.variables_count} variables pour ce template WhatsApp.

Template: "${tpl.body_text}"

Lead:
- Nom: ${lead.name}
- Entreprise: ${lead.company_name || "-"}
- Message: ${lead.message || "-"}
- Notes: ${lead.notes || "-"}

${greetingInstructions(lead.name, lead.company_name)}
Réponds UNIQUEMENT avec JSON: {"variables": ["v1", "v2", ...]} (court, naturel). Conserve l'écriture du nom autorisé, même en arabe.`;

      const resp = await fetch(LOVABLE_AI, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) throw new Error(`AI failed: ${await resp.text()}`);
      const data = await resp.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      const vars = normalizeTemplateNameVariables(tpl.body_text, parsed.variables || [], lead.name, lead.company_name);
      vars.forEach((v: string, i: number) => {
        preview = preview.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v);
      });
    }

    return new Response(JSON.stringify({ preview }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("preview-template-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
