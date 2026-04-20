// Génère un message WhatsApp de suivi pour un lead via Lovable AI Gateway
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
  qualification: "Le lead vient de répondre — UNE seule question si pas encore qualifié, SINON propose directement 2 créneaux ou le lien de réservation",
  propose_meeting: "Propose 2 créneaux concrets cette semaine OU partage le lien de réservation",
};

const PUBLIC_BASE_URL = "https://digital-launch-crm.lovable.app";

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

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Settings : par workspace si dispo, sinon legacy par owner
    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await supabase.from("followup_automation_settings").select("*").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase.from("followup_automation_settings").select("*").eq("owner_id", ownerId).is("workspace_id", null).maybeSingle();
      settings = data;
    }

    const [{ data: history }, { data: offer }] = await Promise.all([
      supabase.from("whatsapp_messages").select("direction,content,sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: true }).limit(20),
      supabase.from("leads").select("offer_id, offers(name, description, price, slug)").eq("id", lead_id).maybeSingle(),
    ]);

    const offerData = (offer as any)?.offers;
    const offerInfo = offerData
      ? `Offre proposée: ${offerData.name} — ${offerData.description ?? ''} ${offerData.price ? `(${offerData.price})` : ''}`
      : "Aucune offre liée";

    const bookingLink = offerData?.slug
      ? `${PUBLIC_BASE_URL}/offers/${offerData.slug}/page`
      : null;

    const inboundCount = (history ?? []).filter((m: any) => m.direction === 'inbound').length;

    const historyText = (history ?? []).map(m => `${m.direction === 'inbound' ? 'LEAD' : 'MOI'}: ${m.content}`).join("\n") || "Aucun échange précédent.";

    const defaultInstructions = "Tu es un closer humain. Pose 3 à 5 questions ESSENTIELLES max pour qualifier (problème principal, urgence, contexte). Dès qu'un signal d'intérêt apparaît, propose un créneau précis (ex: 'Mardi 14h ou Jeudi 10h ?') ou partage le lien de réservation. Max 2 phrases. Pas de blabla, ton direct et conversationnel.";

    const systemPrompt = `${settings?.ai_instructions ?? defaultInstructions}

RÈGLES STRICTES :
- MAX 2 phrases, ton direct et conversationnel
- 1 SEULE question par message (jamais 2 ou 3)
- Le lead a déjà répondu ${inboundCount} fois → ${inboundCount >= 1 ? "PROPOSE MAINTENANT un créneau ou le lien de réservation (pas une nouvelle question sauf info critique manquante)" : "pose UNE question d'ouverture"}
- Pour proposer un RDV : ${bookingLink ? `partage ce lien → ${bookingLink}` : "propose 2 créneaux concrets cette semaine (ex: 'Mardi 14h ou Jeudi 10h ?')"}
- Pas de "Bonjour" si déjà dit, pas de signature, pas d'emoji excessif (1 max)

CONTEXTE LEAD:
- Nom: ${lead.name}
- Entreprise: ${lead.company_name || 'N/A'}
- Source: ${lead.source}
- Message initial du lead: "${lead.message || 'Aucun'}"
- Notes internes: ${lead.notes || 'Aucune'}
- ${offerInfo}
${bookingLink ? `- Lien de réservation: ${bookingLink}` : '- Pas de lien de réservation → propose 2 créneaux à confirmer'}

HISTORIQUE DE LA CONVERSATION WHATSAPP (${inboundCount} réponse(s) du lead):
${historyText}

${settings?.ai_examples ? `EXEMPLES DE MESSAGES À SUIVRE:\n${settings.ai_examples}\n` : ''}

TÂCHE ACTUELLE: ${TASK_LABEL[task_type] || task_type}

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

    return new Response(JSON.stringify({ message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-followup-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
