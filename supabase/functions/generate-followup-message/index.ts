// Génère un message WhatsApp de suivi via Lovable AI Gateway.
// Utilise la qualification structurée (lead_qualification) et sélectionne un prompt contextuel
// selon l'intent / interest_level / objections.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TASK_LABEL: Record<string, string> = {
  initial_message: "PREMIER message de prise de contact (présentation courte + 1 question simple)",
  followup_1: "PREMIÈRE relance (sans réponse) — courte, bienveillante, recadre la valeur",
  followup_2: "DEUXIÈME relance (sans réponse) — preuve sociale ou bénéfice concret",
  last_followup: "DERNIÈRE relance — soft close, propose de clore si pas intéressé",
  qualification: "Le lead vient de répondre — réagis selon le contexte qualif",
  propose_meeting: "Lead chaud → propose 2 créneaux concrets OU partage le lien de réservation",
  reactivation: "Lead silencieux → réveille la conversation avec une question ouverte",
};

const PUBLIC_BASE_URL = "https://digital-launch-crm.lovable.app";

const DEFAULT_PROMPTS = {
  qualification: "Tu qualifies un lead. Pose UNE seule question essentielle pour comprendre son contexte (problème, urgence ou décideur). Max 2 phrases. Direct, conversationnel.",
  objection: "Le lead a soulevé une objection. Reconnais-la brièvement, retourne-la en avantage, puis propose un mini-engagement (créneau court de 15 min ou démo). Max 2 phrases.",
  closing: "Le lead est qualifié et chaud. Propose IMMÉDIATEMENT 2 créneaux concrets cette semaine OU partage le lien de réservation. Aucune nouvelle question. Max 2 phrases.",
  reactivation: "Le lead est silencieux. Réveille la conversation avec une question ouverte, valeur, sans pression. Max 2 phrases. Pas de relance générique style 'tu es là ?'.",
};

function pickPromptKey(qualification: any, taskType: string): keyof typeof DEFAULT_PROMPTS {
  if (taskType === "reactivation" || taskType === "template_24h") return "reactivation";
  if (taskType === "propose_meeting") return "closing";
  const intent = qualification?.intent;
  const interest = qualification?.interest_level ?? 0;
  const objections = qualification?.objections ?? [];
  if (intent === "ready_to_book" || interest >= 70) return "closing";
  if (intent === "objection" || objections.length > 0) return "objection";
  return "qualification";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const isInternalCron = req.headers.get("x-internal-cron") === "1";
    const cronOwnerId = req.headers.get("x-owner-id");
    if (!authHeader && !isInternalCron) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = isInternalCron
      ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader! } } });

    let ownerId = cronOwnerId;
    if (!isInternalCron) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      ownerId = user.id;
    }

    const { lead_id, task_type, variant } = await req.json();
    if (!lead_id || !task_type) return new Response(JSON.stringify({ error: "Missing lead_id or task_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await supabase.from("followup_automation_settings").select("*").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase.from("followup_automation_settings").select("*").eq("owner_id", ownerId).is("workspace_id", null).maybeSingle();
      settings = data;
    }

    const [{ data: history }, { data: offer }, { data: qualification }] = await Promise.all([
      supabase.from("whatsapp_messages").select("direction,content,sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: true }).limit(20),
      supabase.from("leads").select("offer_id, offers(name, description, price, slug)").eq("id", lead_id).maybeSingle(),
      supabase.from("lead_qualification").select("*").eq("lead_id", lead_id).maybeSingle(),
    ]);

    const offerData = (offer as any)?.offers;
    const offerInfo = offerData
      ? `Offre proposée: ${offerData.name} — ${offerData.description ?? ''} ${offerData.price ? `(${offerData.price})` : ''}`
      : "Aucune offre liée";
    const bookingLink = offerData?.slug ? `${PUBLIC_BASE_URL}/offers/${offerData.slug}/page` : null;

    const inboundCount = (history ?? []).filter((m: any) => m.direction === 'inbound').length;
    const historyText = (history ?? []).slice(-10).map(m => `${m.direction === 'inbound' ? 'LEAD' : 'MOI'}: ${m.content}`).join("\n") || "Aucun échange précédent.";

    // Sélection du prompt contextuel
    const promptKey = pickPromptKey(qualification, task_type);
    const customPrompt = settings?.[`prompt_${promptKey}`]?.trim();
    const contextualPrompt = customPrompt || DEFAULT_PROMPTS[promptKey];

    const baseInstructions = settings?.ai_instructions?.trim() || "Tu es un closer humain, direct, conversationnel.";

    const qualifBlock = qualification
      ? `QUALIFICATION DÉJÀ DÉTECTÉE (utilise-la, ne re-pose pas ces questions) :
- Problème : ${qualification.pain_point || "inconnu"}
- Urgence : ${qualification.urgency}
- Budget : ${qualification.budget_signal}
- Décideur : ${qualification.decision_maker}
- Objections rencontrées : ${(qualification.objections ?? []).join(", ") || "aucune"}
- Intérêt estimé : ${qualification.interest_level}/100
- Résumé : ${qualification.summary || "—"}`
      : "QUALIFICATION : pas encore analysée.";

    const variantHint = variant === "B" ? "\n\n⚠️ VARIANTE B : adopte un angle différent de ce que tu écrirais habituellement (autre accroche, autre question)." : "";

    const systemPrompt = `${baseInstructions}

MODE CONTEXTUEL : ${promptKey.toUpperCase()}
${contextualPrompt}${variantHint}

RÈGLES STRICTES :
- MAX 2 phrases
- 1 SEULE question par message (jamais 2 ou 3)
- Pas de "Bonjour" si déjà dit, pas de signature, 1 emoji max
- Pour proposer un RDV : ${bookingLink ? `partage ce lien → ${bookingLink}` : "propose 2 créneaux concrets cette semaine (ex: 'Mardi 14h ou Jeudi 10h ?')"}

CONTEXTE LEAD :
- Nom : ${lead.name}
- Entreprise : ${lead.company_name || 'N/A'}
- Source : ${lead.source}
- Message initial : "${lead.message || 'Aucun'}"
- ${offerInfo}
${bookingLink ? `- Lien de réservation : ${bookingLink}` : ''}

${qualifBlock}

HISTORIQUE WHATSAPP (${inboundCount} réponse(s) du lead, 10 derniers) :
${historyText}

${settings?.ai_examples ? `EXEMPLES DE STYLE :\n${settings.ai_examples}\n` : ''}

TÂCHE ACTUELLE : ${TASK_LABEL[task_type] || task_type}

Génère UNIQUEMENT le texte du message WhatsApp (français, max 2 phrases).`;

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

    return new Response(JSON.stringify({ message, prompt_used: promptKey, variant: variant ?? "A" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-followup-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
