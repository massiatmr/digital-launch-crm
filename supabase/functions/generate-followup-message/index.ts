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

const DEFAULT_DAY_START = "11:00";
const DEFAULT_DAY_END = "15:00";
const DEFAULT_SLOT_DURATION = 45;
const DEFAULT_MAX_FUTURE_DAYS = 14;
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const DISPLAY_TIME_ZONE = "Europe/Paris";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function generateHourlySlots(startTime: string, endTime: string, durationMin: number): string[] {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const out: string[] = [];
  for (let t = startMin; t + durationMin <= endMin; t += 60) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  let utcTs = baseUtc;
  for (let i = 0; i < 2; i++) {
    utcTs = baseUtc - getTimeZoneOffsetMs(timeZone, new Date(utcTs));
  }

  return new Date(utcTs);
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}


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
 * Retourne les créneaux libres du PROCHAIN jour disponible
 * (durée = paramétrée, plage = day_start_time → day_end_time, incrément = 1h).
 * Saute les jours déjà proposés dans l'historique. Limité à max_future_days.
 */
async function getNextAvailableSlots(
  admin: any,
  ownerId: string,
  workspaceId: string | null,
  alreadyProposedDates: Set<string>,
): Promise<{ date: string; slots: string[]; label: string; duration: number } | null> {
  const now = new Date();

  const { data: settings } = await admin
    .from("availability_settings")
    .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const ownerTimeZone: string = settings?.timezone ?? DISPLAY_TIME_ZONE;
  const workingDays: number[] = settings?.working_days ?? DEFAULT_WORKING_DAYS;
  const dayStart: string = settings?.day_start_time ?? DEFAULT_DAY_START;
  const dayEnd: string = settings?.day_end_time ?? DEFAULT_DAY_END;
  const slotDurationMin: number = settings?.slot_duration_minutes ?? DEFAULT_SLOT_DURATION;
  const maxDays: number = settings?.max_future_days ?? DEFAULT_MAX_FUTURE_DAYS;
  const minLeadHours: number = settings?.min_lead_time_hours ?? 2;
  const slotDurationMs = slotDurationMin * 60 * 1000;
  const minLeadMs = minLeadHours * 60 * 60 * 1000;
  const baseSlots = generateHourlySlots(dayStart, dayEnd, slotDurationMin);

  const searchEnd = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

  const ownerToday = formatDateInTimeZone(now, ownerTimeZone);
  const searchEndDate = formatDateInTimeZone(searchEnd, ownerTimeZone);

  const { data: blackoutsData } = await admin
    .from("availability_blackouts")
    .select("blackout_date")
    .eq("owner_id", ownerId)
    .gte("blackout_date", ownerToday)
    .lte("blackout_date", searchEndDate);
  const blackoutSet = new Set<string>((blackoutsData ?? []).map((b: any) => b.blackout_date));

  let bQuery = admin
    .from("bookings")
    .select("booking_date, time_slot")
    .gte("booking_date", ownerToday)
    .lte("booking_date", searchEndDate)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  if (workspaceId) bQuery = bQuery.eq("workspace_id", workspaceId);
  else bQuery = bQuery.eq("owner_id", ownerId);
  const { data: bookings } = await bQuery;
  const busySet = new Set<string>();
  (bookings ?? []).forEach((b: any) => {
    const ownerBookingStart = zonedDateTimeToUtc(b.booking_date, b.time_slot, DISPLAY_TIME_ZONE);
    busySet.add(`${formatDateInTimeZone(ownerBookingStart, ownerTimeZone)}|${formatTimeInTimeZone(ownerBookingStart, ownerTimeZone)}`);
  });

  const accessToken = await getGoogleAccessToken(admin, ownerId);
  let gBusy: Array<{ start: Date; end: Date }> = [];
  if (accessToken) {
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: zonedDateTimeToUtc(ownerToday, "00:00", ownerTimeZone).toISOString(),
          timeMax: new Date(zonedDateTimeToUtc(searchEndDate, "23:59", ownerTimeZone).getTime() + 59 * 1000).toISOString(),
          timeZone: ownerTimeZone,
          items: [{ id: "primary" }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        gBusy = (data.calendars?.primary?.busy ?? []).map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }));
      }
    } catch (_) { /* ignore */ }
  }

  const labels = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const cursorDateStr = ownerToday;

  for (let d = 0; d <= maxDays; d++) {
    const dateStr = addDays(cursorDateStr, d);
    const dateProbe = new Date(`${dateStr}T12:00:00Z`);
    const dow = dateProbe.getUTCDay();
    if (!workingDays.includes(dow)) continue;
    if (blackoutSet.has(dateStr)) continue;
    if (alreadyProposedDates.has(dateStr)) continue;

    const freeSlots: string[] = [];
    for (const slot of baseSlots) {
      if (busySet.has(`${dateStr}|${slot}`)) continue;
      const slotStart = zonedDateTimeToUtc(dateStr, slot, ownerTimeZone);
      if (slotStart.getTime() < now.getTime() + minLeadMs) continue;
      const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
      const overlaps = gBusy.some((b) => slotStart < b.end && slotEnd > b.start);
      if (overlaps) continue;
      const displayDate = formatDateInTimeZone(slotStart, DISPLAY_TIME_ZONE);
      if (displayDate !== dateStr) continue;
      freeSlots.push(formatTimeInTimeZone(slotStart, DISPLAY_TIME_ZONE));
    }
    if (freeSlots.length === 0) continue;

    const dayLabel = labels[dow];
    const dateLabel = dateProbe.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: DISPLAY_TIME_ZONE });
    return {
      date: dateStr,
      slots: freeSlots,
      label: `${dayLabel} ${dateLabel}`,
      duration: slotDurationMin,
    };
  }
  return null;
}

/**
 * Détecte les dates (YYYY-MM-DD) déjà proposées par MOI dans l'historique outbound.
 * Heuristique simple : matchs sur "lundi 12 mai", "mardi 14", patterns FR.
 */
function extractProposedDates(history: any[]): Set<string> {
  const set = new Set<string>();
  const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const now = new Date();
  const year = now.getFullYear();
  for (const m of history ?? []) {
    if (m.direction !== "outbound") continue;
    const text = (m.content || "").toLowerCase();
    for (let mi = 0; mi < 12; mi++) {
      const re = new RegExp(`(\\d{1,2})\\s+${months[mi]}`, "g");
      let match;
      while ((match = re.exec(text)) !== null) {
        const day = parseInt(match[1], 10);
        if (day >= 1 && day <= 31) {
          const candidate = new Date(year, mi, day);
          if (candidate.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) candidate.setFullYear(year + 1);
          set.add(candidate.toISOString().slice(0, 10));
        }
      }
    }
  }
  return set;
}

export const DEFAULT_PROMPTS = {
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

function pickPromptKey(qualification: any, taskType: string, variant: string | null | undefined, interestThreshold: number): keyof typeof DEFAULT_PROMPTS {
  if (variant === "slot_confirmation") return "slot_confirmation";
  if (taskType === "reactivation" || taskType === "template_24h") return "reactivation";
  if (taskType === "propose_meeting") return "closing";
  const intent = qualification?.intent;
  const interest = qualification?.interest_level ?? 0;
  const objections = qualification?.objections ?? [];
  if (intent === "ready_to_book" || interest >= interestThreshold) return "closing";
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

    const [{ data: history }, { data: offer }, { data: qualification }] = await Promise.all([
      supabase.from("whatsapp_messages").select("direction,content,sent_at").eq("lead_id", lead_id).order("sent_at", { ascending: true }).limit(20),
      supabase.from("leads").select("offer_id, offers(name, description, price, slug, niche, features, show_price)").eq("id", lead_id).maybeSingle(),
      supabase.from("lead_qualification").select("*").eq("lead_id", lead_id).maybeSingle(),
    ]);

    // Détecte les jours déjà proposés dans l'historique pour les éviter
    const proposedDates = extractProposedDates(history ?? []);
    const nextSlot = await getNextAvailableSlots(admin, ownerId!, lead.workspace_id, proposedDates);

    const offerData = (offer as any)?.offers;
    let offerInfo = "Aucune offre liée à ce lead.";
    if (offerData) {
      const featureList = Array.isArray(offerData.features)
        ? offerData.features.map((f: any) => typeof f === "string" ? f : (f?.title || f?.label || f?.name || "")).filter(Boolean)
        : [];
      const featuresStr = featureList.length ? `\n  • ${featureList.slice(0, 8).join("\n  • ")}` : "";
      const priceStr = offerData.show_price && offerData.price ? ` — Prix : ${offerData.price}` : "";
      offerInfo = `OFFRE PROPOSÉE AU LEAD (mets-la en avant, pose des questions pour vérifier qu'elle correspond à son besoin) :
- Nom : ${offerData.name}${priceStr}
- Niche cible : ${offerData.niche || "N/A"}
- Description : ${offerData.description || "—"}
- Bénéfices / inclus :${featuresStr || " (aucun listé)"}
⚠️ Tes questions doivent vérifier si CETTE offre résout son problème. Reprends ses mots à lui pour relier son contexte aux bénéfices ci-dessus.`;
    }
    const bookingLink = offerData?.slug ? `${PUBLIC_BASE_URL}/offers/${offerData.slug}/page` : null;

    const inboundCount = (history ?? []).filter((m: any) => m.direction === 'inbound').length;
    const historyScan = Math.max(1, settings?.history_scan_count ?? 10);
    const historyText = (history ?? []).slice(-historyScan).map(m => `${m.direction === 'inbound' ? 'LEAD' : 'MOI'}: ${m.content}`).join("\n") || "Aucun échange précédent.";

    const interestThreshold = settings?.interest_threshold_closing ?? 70;
    const promptKey = pickPromptKey(qualification, task_type, variant, interestThreshold);
    const isSlotConfirmation = promptKey === "slot_confirmation";
    const customPrompt = settings?.[`prompt_${promptKey}`]?.trim();
    const contextualPrompt = customPrompt || DEFAULT_PROMPTS[promptKey];

    const baseInstructions = settings?.ai_instructions?.trim() || "Tu es un closer humain, direct, conversationnel.";

    // Variables de garde-fous (overridables via settings)
    const maxSentences = settings?.max_sentences ?? 2;
    const maxQuestions = settings?.max_questions ?? 1;
    const maxEmojis = settings?.max_emojis ?? 1;
    const allowGreeting = settings?.allow_repeated_greeting ?? false;
    const allowSignature = settings?.allow_signature ?? false;
    const nicheStrict = settings?.niche_strict ?? true;
    const forbiddenWords: string[] = settings?.forbidden_words ?? [];
    const antiRepetition = settings?.anti_repetition ?? true;
    const neverReask: string[] = settings?.never_reask_fields ?? ["email"];

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

    const slotsBlock = nextSlot
      ? `\nPROCHAIN JOUR DISPONIBLE (calendrier + Google sync) : **${nextSlot.label}**\nCréneaux libres ce jour-là (durée ${nextSlot.duration} min) : ${nextSlot.slots.join(" / ")}\n⚠️ Si tu proposes un RDV : propose 2 créneaux MAX du même jour parmi cette liste (idéalement un tôt + un plus tard). N'invente JAMAIS d'autre horaire/jour.\n⚠️ Les jours déjà proposés dans l'historique ont été automatiquement évités — ce jour est NOUVEAU.`
      : "\n⚠️ Aucun créneau disponible dans la fenêtre de réservation autorisée. Propose au lead de te recontacter plus tard.";

    const knownEmail = (lead.email && lead.email.includes("@") && !lead.email.endsWith("@whatsapp.tmp"))
      ? lead.email.trim()
      : null;
    const emailKnownAndProtected = knownEmail && neverReask.includes("email");
    const emailBlock = emailKnownAndProtected
      ? `\nEMAIL DU LEAD DÉJÀ CONNU : ${knownEmail}\n⚠️ NE REDEMANDE JAMAIS son email. Si tu dois lui envoyer une invitation/confirmation/détails, écris naturellement : "Je t'envoie ça sur ${knownEmail}, c'est toujours le bon ?" puis enchaîne sans attendre.`
      : `\nEMAIL DU LEAD : ${knownEmail ?? "inconnu"}. Si tu as besoin de l'email pour une invitation, demande-le UNE SEULE FOIS, simplement.`;

    const phoneKnown = lead.phone && neverReask.includes("phone")
      ? `\n⚠️ Numéro déjà connu (${lead.phone}). Ne le redemande jamais.` : "";

    const nicheRule = nicheStrict && offerData?.niche
      ? `- ⚠️ NICHE STRICTE : tu DOIS rester dans le vocabulaire de la niche "${offerData.niche}". N'utilise JAMAIS de mots d'autres métiers (ex : "chantier", "construction", "BTP" si la niche n'est pas le bâtiment). Utilise les mots du métier réel du lead.`
      : "";
    const forbiddenRule = forbiddenWords.length
      ? `- ⚠️ MOTS INTERDITS : n'utilise JAMAIS ces mots : ${forbiddenWords.join(", ")}.`
      : "";
    const antiRepRule = antiRepetition
      ? `- ⚠️ ANTI-RÉPÉTITION : relis l'HISTORIQUE ci-dessous (${historyScan} derniers msg). Si une question / formulation similaire a déjà été envoyée par MOI, change COMPLÈTEMENT d'angle. Ne reformule pas la même question.`
      : "";
    const greetingRule = allowGreeting ? "" : `- Pas de "Bonjour" si déjà dit`;
    const signatureRule = allowSignature ? "" : `- Pas de signature`;

    const systemPrompt = `${baseInstructions}

MODE CONTEXTUEL : ${promptKey.toUpperCase()}
${contextualPrompt}${variantHint}

RÈGLES STRICTES :
- ${isSlotConfirmation ? "4-5 phrases max — message de confirmation structuré" : `MAX ${maxSentences} phrase(s)`}
- ${isSlotConfirmation ? "Aucune nouvelle question (sauf si email inconnu)" : `${maxQuestions} question(s) MAX par message`}
${greetingRule ? greetingRule + "\n" : ""}${signatureRule ? signatureRule + "\n" : ""}- ${maxEmojis} emoji(s) max
- ${isSlotConfirmation ? "Récapitule le créneau EXACT que le lead vient d'accepter en relisant l'historique" : `Pour proposer un RDV : propose 1 ou 2 créneaux EXACTS de la liste ci-dessous, ou partage le lien ${bookingLink ?? '(aucun lien)'}`}
${nicheRule}
${forbiddenRule}
${antiRepRule}
${isSlotConfirmation ? "" : slotsBlock}
${emailBlock}${phoneKnown}

CONTEXTE LEAD :
- Nom : ${lead.name}
- Entreprise : ${lead.company_name || 'N/A'}
- Source : ${lead.source}
- Message initial : "${lead.message || 'Aucun'}"

${offerInfo}
${bookingLink ? `Lien de réservation de l'offre : ${bookingLink}` : ''}

${qualifBlock}

HISTORIQUE WHATSAPP (${inboundCount} réponse(s) du lead, ${historyScan} derniers) :
${historyText}

${settings?.ai_examples ? `EXEMPLES DE STYLE :\n${settings.ai_examples}\n` : ''}

TÂCHE ACTUELLE : ${TASK_LABEL[task_type] || task_type}

Génère UNIQUEMENT le texte du message WhatsApp (français, max ${isSlotConfirmation ? 5 : maxSentences} phrases).`;

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
