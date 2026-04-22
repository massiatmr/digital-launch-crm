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

// Créneaux par défaut (cohérent avec check-availability)
const DEFAULT_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
];
const MEETING_DURATION_MS = 60 * 60 * 1000;

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get("Google_Client_id")!;
  const clientSecret = Deno.env.get("Client_secret")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function getGoogleAccessToken(admin: any, ownerId: string): Promise<string | null> {
  const { data: tokens } = await admin.from("google_tokens").select("*").eq("user_id", ownerId).maybeSingle();
  if (!tokens) return null;
  const expiresAt = new Date(tokens.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return tokens.access_token;
  const newToken = await refreshGoogleToken(tokens.refresh_token);
  if (newToken) {
    await admin.from("google_tokens").update({ access_token: newToken, expires_at: new Date(Date.now() + 3500 * 1000).toISOString() } as any).eq("user_id", ownerId);
  }
  return newToken;
}

/**
 * Retourne les 3 prochains créneaux libres (bookings DB + Google FreeBusy).
 */
async function getNextAvailableSlots(admin: any, ownerId: string, workspaceId: string | null): Promise<string[]> {
  const now = new Date();
  const searchEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  let bQuery = admin
    .from("bookings")
    .select("booking_date, time_slot")
    .gte("booking_date", now.toISOString().slice(0, 10))
    .lte("booking_date", searchEnd.toISOString().slice(0, 10))
    .neq("status", "cancelled")
    .is("deleted_at", null);
  if (workspaceId) bQuery = bQuery.eq("workspace_id", workspaceId);
  else bQuery = bQuery.eq("owner_id", ownerId);
  const { data: bookings } = await bQuery;
  const busySet = new Set<string>();
  (bookings ?? []).forEach((b: any) => busySet.add(`${b.booking_date}|${b.time_slot}`));

  const accessToken = await getGoogleAccessToken(admin, ownerId);
  let gBusy: Array<{ start: Date; end: Date }> = [];
  if (accessToken) {
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: now.toISOString(),
          timeMax: searchEnd.toISOString(),
          timeZone: "Europe/Paris",
          items: [{ id: "primary" }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        gBusy = (data.calendars?.primary?.busy ?? []).map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }));
      }
    } catch (_) { /* ignore */ }
  }

  const results: string[] = [];
  const labels = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let d = 0; d < 10 && results.length < 3; d++) {
    const date = new Date(cursor.getTime() + d * 24 * 60 * 60 * 1000);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = date.toISOString().slice(0, 10);
    for (const slot of DEFAULT_SLOTS) {
      if (results.length >= 3) break;
      if (busySet.has(`${dateStr}|${slot}`)) continue;
      const [h, m] = slot.split(":").map(Number);
      const slotStart = new Date(date);
      slotStart.setHours(h, m, 0, 0);
      if (slotStart.getTime() < now.getTime() + 2 * 60 * 60 * 1000) continue;
      const slotEnd = new Date(slotStart.getTime() + MEETING_DURATION_MS);
      const overlaps = gBusy.some((b) => slotStart < b.end && slotEnd > b.start);
      if (overlaps) continue;
      const dayLabel = labels[dow];
      const dateLabel = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      results.push(`${dayLabel} ${dateLabel} à ${slot}`);
    }
  }
  return results;
}

const DEFAULT_PROMPTS = {
  qualification: "Tu qualifies un lead. Pose UNE seule question essentielle pour comprendre son contexte (problème, urgence ou décideur). Max 2 phrases. Direct, conversationnel.",
  objection: "Le lead a soulevé une objection. Reconnais-la brièvement, retourne-la en avantage, puis propose un mini-engagement (créneau court de 15 min ou démo). Max 2 phrases.",
  closing: "Le lead est qualifié et chaud. Propose IMMÉDIATEMENT 2 créneaux concrets cette semaine OU partage le lien de réservation. Aucune nouvelle question. Max 2 phrases.",
  reactivation: "Le lead est silencieux. Réveille la conversation avec une question ouverte, valeur, sans pression. Max 2 phrases. Pas de relance générique style 'tu es là ?'.",
  slot_confirmation: `Le lead vient de CONFIRMER un créneau de RDV que tu lui avais proposé. Tu dois lui envoyer un message de CONFIRMATION chaleureux et structuré qui contient EXACTEMENT ces éléments dans cet ordre :
1. "Parfait, c'est noté pour [JOUR + DATE + HEURE EXACTE qu'il a confirmé]" — relis l'historique pour identifier précisément le créneau accepté.
2. "Je t'envoie l'invitation sur [EMAIL connu si dispo, sinon demande l'email]. Dis-moi si tu l'as bien reçue."
3. "Je t'envoie aussi quelques ressources et détails sur nos services d'ici là."
4. Termine par : "On se retrouve [JOUR DATE HEURE] 🙌" ou équivalent chaleureux.
Pas de question supplémentaire (sauf si email inconnu). 4-5 phrases max, ton humain et confiant. UN seul emoji max à la fin.`,
};

function pickPromptKey(qualification: any, taskType: string, variant?: string | null): keyof typeof DEFAULT_PROMPTS {
  if (variant === "slot_confirmation") return "slot_confirmation";
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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: history }, { data: offer }, { data: qualification }, availableSlots] = await Promise.all([
      supabase.from("whatsapp_messages").select("direction,content,sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: true }).limit(20),
      supabase.from("leads").select("offer_id, offers(name, description, price, slug)").eq("id", lead_id).maybeSingle(),
      supabase.from("lead_qualification").select("*").eq("lead_id", lead_id).maybeSingle(),
      getNextAvailableSlots(admin, ownerId!, lead.workspace_id),
    ]);

    const offerData = (offer as any)?.offers;
    const offerInfo = offerData
      ? `Offre proposée: ${offerData.name} — ${offerData.description ?? ''} ${offerData.price ? `(${offerData.price})` : ''}`
      : "Aucune offre liée";
    const bookingLink = offerData?.slug ? `${PUBLIC_BASE_URL}/offers/${offerData.slug}/page` : null;

    const inboundCount = (history ?? []).filter((m: any) => m.direction === 'inbound').length;
    const historyText = (history ?? []).slice(-10).map(m => `${m.direction === 'inbound' ? 'LEAD' : 'MOI'}: ${m.content}`).join("\n") || "Aucun échange précédent.";

    const promptKey = pickPromptKey(qualification, task_type, variant);
    const isSlotConfirmation = promptKey === "slot_confirmation";
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

    const slotsBlock = availableSlots.length > 0
      ? `\nCRÉNEAUX RÉELLEMENT DISPONIBLES (calendrier synchronisé) :\n${availableSlots.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}\n⚠️ Si tu proposes un RDV, UTILISE EXCLUSIVEMENT 1 ou 2 de ces créneaux. N'invente JAMAIS d'horaire.`
      : "";

    // Email déjà connu dans le CRM : on demande à l'IA de le confirmer au lieu de le redemander.
    const knownEmail = (lead.email && lead.email.includes("@") && !lead.email.endsWith("@whatsapp.tmp"))
      ? lead.email.trim()
      : null;
    const emailBlock = knownEmail
      ? `\nEMAIL DU LEAD DÉJÀ CONNU : ${knownEmail}\n⚠️ NE REDEMANDE JAMAIS son email. Si tu dois lui envoyer une invitation/confirmation/détails, écris naturellement : "Je t'envoie ça sur ${knownEmail}, c'est toujours le bon ?" puis enchaîne sans attendre.`
      : `\nEMAIL DU LEAD : inconnu. Si tu as besoin de l'email pour une invitation, demande-le UNE SEULE FOIS, simplement.`;

    const systemPrompt = `${baseInstructions}

MODE CONTEXTUEL : ${promptKey.toUpperCase()}
${contextualPrompt}${variantHint}

RÈGLES STRICTES :
- ${isSlotConfirmation ? "4-5 phrases max — message de confirmation structuré" : "MAX 2 phrases"}
- ${isSlotConfirmation ? "Aucune nouvelle question (sauf si email inconnu)" : "1 SEULE question par message (jamais 2 ou 3)"}
- Pas de "Bonjour" si déjà dit, pas de signature, 1 emoji max
- ${isSlotConfirmation ? "Récapitule le créneau EXACT que le lead vient d'accepter en relisant l'historique" : `Pour proposer un RDV : propose 1 ou 2 créneaux EXACTS de la liste ci-dessous, ou partage le lien ${bookingLink ?? '(aucun lien)'}`}
${isSlotConfirmation ? "" : slotsBlock}
${emailBlock}

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
