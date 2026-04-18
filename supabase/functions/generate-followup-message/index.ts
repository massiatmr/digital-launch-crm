// Génère un message WhatsApp de suivi pour un lead via Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TASK_LABEL: Record<string, string> = {
  initial_message: "PREMIER message de prise de contact (présentation courte, 1 question d'ouverture)",
  followup_1: "PREMIÈRE relance (24h sans réponse) — légère, bienveillante, recadre la valeur",
  followup_2: "DEUXIÈME relance (48h sans réponse) — apporte une preuve / un bénéfice concret",
  last_followup: "DERNIÈRE relance (72h sans réponse) — ton soft close, propose de clore si pas intéressé",
  qualification: "Réponse au lead qui vient de répondre — qualifie progressivement (1 seule question)",
  propose_meeting: "Proposition d'un rendez-vous (créneaux suggérés)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const isInternalCron = req.headers.get("x-internal-cron") === "1";
    const cronOwnerId = req.headers.get("x-owner-id");
    if (!authHeader && !isInternalCron) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = isInternalCron
      ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader! } } });

    let ownerId = cronOwnerId;
    if (!isInternalCron) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      ownerId = user.id;
    }

    const { lead_id, task_type } = await req.json();
    if (!lead_id || !task_type) return new Response(JSON.stringify({ error: "Missing lead_id or task_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: lead }, { data: settings }, { data: history }, { data: offer }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", lead_id).maybeSingle(),
      supabase.from("followup_automation_settings").select("*").eq("owner_id", ownerId).maybeSingle(),
      supabase.from("whatsapp_messages").select("direction,content,sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: true }).limit(20),
      supabase.from("leads").select("offer_id, offers(name, description, price)").eq("id", lead_id).maybeSingle(),
    ]);

    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const offerInfo = (offer as any)?.offers
      ? `Offre proposée: ${(offer as any).offers.name} — ${(offer as any).offers.description ?? ''} ${(offer as any).offers.price ? `(${(offer as any).offers.price})` : ''}`
      : "Aucune offre liée";

    const historyText = (history ?? []).map(m => `${m.direction === 'inbound' ? 'LEAD' : 'MOI'}: ${m.content}`).join("\n") || "Aucun échange précédent.";

    const systemPrompt = `${settings?.ai_instructions ?? "Tu es un commercial humain et bienveillant. Réponds en français, court (max 2 phrases), pose UNE seule question à la fois."}

CONTEXTE LEAD:
- Nom: ${lead.name}
- Entreprise: ${lead.company_name || 'N/A'}
- Source: ${lead.source}
- Message initial du lead: "${lead.message || 'Aucun'}"
- Notes internes: ${lead.notes || 'Aucune'}
- ${offerInfo}

HISTORIQUE DE LA CONVERSATION WHATSAPP:
${historyText}

${settings?.ai_examples ? `EXEMPLES DE MESSAGES À SUIVRE:\n${settings.ai_examples}\n` : ''}

TÂCHE ACTUELLE: ${TASK_LABEL[task_type] || task_type}

Génère UNIQUEMENT le texte du message WhatsApp à envoyer (pas de salutation type "Bonjour" si déjà fait, pas de signature, pas d'emoji excessif). Réponds en français, ton naturel, max 2-3 phrases.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings?.ai_model || "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Génère le message maintenant." }],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit, réessaie dans quelques secondes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResponse.json();
    const message = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-followup-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
