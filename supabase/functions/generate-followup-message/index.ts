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

function resolveRequestedDateFromText(text: string, timeZone: string): { date: string; label: string } | null {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const today = formatDateInTimeZone(new Date(), timeZone);
  const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay();

  for (let targetDow = 0; targetDow < weekdays.length; targetDow++) {
    const day = weekdays[targetDow];
    if (!new RegExp(`\\b${day}\\b`, "i").test(normalized)) continue;
    const delta = (targetDow - todayDow + 7) % 7;
    const date = addDays(today, delta);
    const d = new Date(`${date}T12:00:00Z`);
    const dateLabel = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: DISPLAY_TIME_ZONE });
    return { date, label: `${weekdays[targetDow]} ${dateLabel}` };
  }
  return null;
}

async function getAvailableSlotsForDate(
  admin: any,
  ownerId: string,
  workspaceId: string | null,
  requestedDate: string,
): Promise<{ date: string; slots: string[]; label: string; duration: number; reason?: string }> {
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
  const minLeadHours: number = settings?.min_lead_time_hours ?? 2;
  const maxDays: number = settings?.max_future_days ?? DEFAULT_MAX_FUTURE_DAYS;
  const baseSlots = generateHourlySlots(dayStart, dayEnd, slotDurationMin);
  const slotDurationMs = slotDurationMin * 60 * 1000;
  const minLeadMs = minLeadHours * 60 * 60 * 1000;
  const ownerToday = formatDateInTimeZone(now, ownerTimeZone);
  const labels = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const probe = new Date(`${requestedDate}T12:00:00Z`);
  const dow = probe.getUTCDay();
  const label = `${labels[dow]} ${probe.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: DISPLAY_TIME_ZONE })}`;

  const daysAhead = Math.round((zonedDateTimeToUtc(requestedDate, "12:00", ownerTimeZone).getTime() - zonedDateTimeToUtc(ownerToday, "12:00", ownerTimeZone).getTime()) / (24 * 60 * 60 * 1000));
  if (daysAhead < 0 || daysAhead > maxDays) return { date: requestedDate, slots: [], label, duration: slotDurationMin, reason: "hors fenêtre autorisée" };
  if (!workingDays.includes(dow)) return { date: requestedDate, slots: [], label, duration: slotDurationMin, reason: "jour fermé" };

  const { data: blackout } = await admin
    .from("availability_blackouts")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("blackout_date", requestedDate)
    .maybeSingle();
  if (blackout) return { date: requestedDate, slots: [], label, duration: slotDurationMin, reason: "jour bloqué" };

  let bQuery = admin
    .from("bookings")
    .select("booking_date, time_slot")
    .eq("booking_date", requestedDate)
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
          timeMin: zonedDateTimeToUtc(requestedDate, "00:00", ownerTimeZone).toISOString(),
          timeMax: new Date(zonedDateTimeToUtc(requestedDate, "23:59", ownerTimeZone).getTime() + 59 * 1000).toISOString(),
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

  const freeSlots = baseSlots.flatMap((slot) => {
    if (busySet.has(`${requestedDate}|${slot}`)) return [];
    const slotStart = zonedDateTimeToUtc(requestedDate, slot, ownerTimeZone);
    if (slotStart.getTime() < now.getTime() + minLeadMs) return [];
    const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
    if (gBusy.some((b) => slotStart < b.end && slotEnd > b.start)) return [];
    if (formatDateInTimeZone(slotStart, DISPLAY_TIME_ZONE) !== requestedDate) return [];
    return [formatTimeInTimeZone(slotStart, DISPLAY_TIME_ZONE)];
  });

  return { date: requestedDate, slots: freeSlots, label, duration: slotDurationMin, reason: freeSlots.length ? undefined : "aucun créneau libre" };
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
  qualification: "Tu qualifies un lead. Si tu n'as AUCUN contexte sur son activité ou son projet, pose simplement UNE question ouverte pour comprendre ce qu'il fait (son activité, son business, ou le projet sur lequel il bosse). Ne propose JAMAIS de choix binaire du type 'activité actuelle ou nouveau projet'. Si tu as déjà un contexte métier, creuse plutôt son problème ou son urgence. Max 2 phrases. Direct, conversationnel.",
  objection: "Le lead a soulevé une objection. Reconnais-la brièvement, retourne-la en avantage, puis propose un mini-engagement (créneau court de 15 min ou démo). Max 2 phrases.",
  closing: "Le lead est qualifié et chaud. Propose IMMÉDIATEMENT 2 créneaux concrets cette semaine OU partage le lien de réservation. Aucune nouvelle question. Max 2 phrases.",
  reactivation: "Le lead est silencieux. Réveille la conversation avec une question ouverte, valeur, sans pression. Max 2 phrases. Pas de relance générique style 'tu es là ?'.",
  slot_confirmation: `Le lead vient d'accepter ou de proposer un créneau de RDV.

⚠️ AVANT DE CONFIRMER : vérifie que l'heure acceptée par le lead est bien dans la liste "Créneaux libres" fournie plus bas (PROCHAIN JOUR DISPONIBLE). Si oui, confirme. Si NON (ex: lead propose 18h alors que tes dispos vont jusqu'à 15h, ou lead choisit un jour fermé), tu NE confirmes PAS : tu réponds poliment que ce créneau n'est pas disponible et tu proposes 2 créneaux concrets de la liste fournie.

Si tu confirmes, le message contient dans cet ordre :
1. "Parfait, c'est noté pour [JOUR + DATE + HEURE EXACTE acceptée]".
2. "Je t'envoie l'invitation sur [EMAIL connu si dispo, sinon demande l'email]. Dis-moi si tu l'as bien reçue."
3. "Je t'envoie aussi quelques ressources d'ici là."
4. Une phrase de clôture courte et naturelle ("À [jour] alors", "On se retrouve [jour heure]").

4 phrases max, ton humain et naturel.`,
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
    const bearer = authHeader?.replace("Bearer ", "") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = bearer === serviceRole;
    const cronOwnerId = req.headers.get("x-owner-id");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = isServiceRole
      ? createClient(Deno.env.get("SUPABASE_URL")!, serviceRole)
      : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader! } } });

    let ownerId = isServiceRole ? cronOwnerId : null;
    if (!isServiceRole) {
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

    const inboundMessages = (history ?? []).filter((m: any) => m.direction === 'inbound');
    const inboundCount = inboundMessages.length;
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
    const maxEmojis = settings?.max_emojis ?? 0;
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

    const lastInboundText = inboundMessages.slice(-1)[0]?.content ?? "";
    const requestedDate = resolveRequestedDateFromText(lastInboundText, DISPLAY_TIME_ZONE);
    const requestedDateAvailability = requestedDate
      ? await getAvailableSlotsForDate(admin, ownerId!, lead.workspace_id, requestedDate.date)
      : null;

    const slotsBlock = requestedDateAvailability
      ? requestedDateAvailability.slots.length > 0
        ? `\nJOUR DEMANDÉ PAR LE LEAD : **${requestedDateAvailability.label}**\nCréneaux libres ce jour-là (durée ${requestedDateAvailability.duration} min) : ${requestedDateAvailability.slots.join(" / ")}\n⚠️ Le lead a demandé ce jour. Réponds d'abord à cette demande et propose 1 ou 2 créneaux de CE jour uniquement. N'ajoute pas d'autre jour tant qu'il reste des créneaux libres sur ce jour.`
        : `\nJOUR DEMANDÉ PAR LE LEAD : **${requestedDateAvailability.label}**\nAucun créneau libre ce jour-là (${requestedDateAvailability.reason ?? "indisponible"}).\n${nextSlot ? `Alternative réellement libre : **${nextSlot.label}** à ${nextSlot.slots.slice(0, 2).join(" ou ")}.` : "Aucune alternative libre dans la fenêtre autorisée."}\n⚠️ Dis clairement que le jour demandé n'est pas disponible avant de proposer l'alternative. N'invente JAMAIS d'autre horaire/jour.`
      : nextSlot
        ? `\nPROCHAIN JOUR DISPONIBLE (calendrier + Google sync) : **${nextSlot.label}**\nCréneaux libres ce jour-là (durée ${nextSlot.duration} min) : ${nextSlot.slots.join(" / ")}\n⚠️ Si tu proposes un RDV : propose 2 créneaux MAX du même jour parmi cette liste (idéalement un tôt + un plus tard). N'invente JAMAIS d'autre horaire/jour.\n⚠️ Les jours déjà proposés dans l'historique ont été automatiquement évités, ce jour est NOUVEAU.`
        : "\n⚠️ Aucun créneau disponible dans la fenêtre de réservation autorisée. Propose au lead de te recontacter plus tard.";

    const knownEmail = (lead.email && lead.email.includes("@") && !lead.email.endsWith("@whatsapp.tmp"))
      ? lead.email.trim()
      : null;
    const emailKnownAndProtected = knownEmail && neverReask.includes("email");
    const emailBlock = emailKnownAndProtected
      ? `\nEMAIL DU LEAD DÉJÀ CONNU : ${knownEmail}\n⚠️ NE REDEMANDE JAMAIS son email. Si tu dois lui envoyer une invitation/confirmation/détails, écris naturellement : "Je t'envoie ça sur ${knownEmail}, c'est toujours le bon ?" puis enchaîne sans attendre.`
      : `\nEMAIL DU LEAD : ${knownEmail ?? "inconnu"}.\n⚠️ L'EMAIL EST OBLIGATOIRE pour confirmer une réservation (envoi invitation + lien Meet). Si le lead propose/accepte un créneau ou demande à réserver et que l'email est inconnu, DEMANDE-LE EXPLICITEMENT avant toute confirmation. Exemple : "Top pour mardi 14h, tu me donnes ton email pour que je t'envoie l'invitation et le lien Meet ?" Ne confirme JAMAIS un RDV sans avoir l'email.`;

    // Détection nom manquant / placeholder
    const rawName = (lead.name || "").trim();
    const namePlaceholderRegex = /^(prospect|lead|contact|client|inconnu|unknown|whatsapp|messenger|instagram|user|utilisateur|\+?\d[\d\s().-]*)$/i;
    const nameMissing = !rawName || namePlaceholderRegex.test(rawName) || rawName.length < 2;
    const nameBlock = nameMissing
      ? `\nNOM DU LEAD : inconnu (placeholder ou numéro).\n⚠️ Tu ne connais pas son prénom. Demande-le NATURELLEMENT au bon moment (idéalement quand tu confirmes un créneau ou en début d'échange si rien d'autre n'est urgent). Exemple : "Au fait, je n'ai pas ton prénom, c'est quoi ?" Ne salue JAMAIS avec "Salut [placeholder]" — utilise juste "Salut" ou "Hello" sans prénom tant que tu ne le connais pas.`
      : `\nPrénom du lead : ${rawName.split(" ")[0]}.`;

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

    const styleRules = `- STYLE NATUREL OBLIGATOIRE :
  • Écris comme un humain sur WhatsApp : phrases courtes, ton parlé, fluide.
  • INTERDIT : tirets cadratins ou demi-cadratins (— et –). Si tu veux séparer, fais 2 phrases ou utilise une virgule.
  • INTERDIT : ponctuation excessive (pas de !!!, pas de ???, pas de "..." sauf si vraiment justifié, pas de majuscules pour insister).
  • ${maxEmojis === 0 ? "INTERDIT : aucun emoji." : `Maximum ${maxEmojis} emoji(s), uniquement si vraiment naturel.`}
  • Pas de tournures corporate ("n'hésite pas", "je reste à votre disposition", "je me permets de").
  • Évite les doubles espaces et les virgules superflues.`;

    const systemPrompt = `${baseInstructions}

MODE CONTEXTUEL : ${promptKey.toUpperCase()}
${contextualPrompt}${variantHint}

RÈGLES STRICTES :
- ${isSlotConfirmation ? "4 phrases max" : `MAX ${maxSentences} phrase(s)`}
- ${isSlotConfirmation
  ? "Aucune nouvelle question (sauf si email inconnu OU créneau non disponible)"
  : `RÈGLE ABSOLUE — UNE SEULE QUESTION PAR MESSAGE :
  • Tu n'as le droit de poser qu'UNE SEULE question, point. JAMAIS deux.
  • Compte les "?" : il doit y en avoir 0 ou 1, jamais 2.
  • Compte aussi les questions implicites sans "?" ("Tu travailles seul ou en équipe.", "Tu préfères mardi ou jeudi.") : elles comptent aussi comme une question.
  • Une question alternative ("A ou B ?") = 1 question, autorisé.
  • Deux questions sur 2 sujets différents = INTERDIT, même si l'une finit par un point au lieu d'un "?".
  • Exemple INTERDIT : "Tu es satisfait des résultats actuels ou tu veux passer un cap. Tu bosses en équipe ou en solo ?" (2 sujets → 2 questions)
  • Si tu hésites entre 2 questions à poser, choisis la plus utile maintenant et garde l'autre pour le prochain message.`}
${greetingRule ? greetingRule + "\n" : ""}${signatureRule ? signatureRule + "\n" : ""}- ${isSlotConfirmation ? "Vérifie que l'heure acceptée est dans la liste de créneaux libres ci-dessous. Sinon, refuse poliment et propose 2 créneaux RÉELS de la liste." : `Pour proposer un RDV : réponds à la contrainte du lead en priorité, propose 1 ou 2 créneaux EXACTS de la liste ci-dessous, ou partage le lien ${bookingLink ?? '(aucun lien)'}`}
${nicheRule}
${forbiddenRule}
${antiRepRule}
${slotsBlock}
${emailBlock}${nameBlock}${phoneKnown}

${styleRules}

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

Génère UNIQUEMENT le texte du message WhatsApp (français, max ${isSlotConfirmation ? 4 : maxSentences} phrases). Aucun tiret cadratin, aucune ponctuation excessive${maxEmojis === 0 ? ", aucun emoji" : ""}.`;

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
    let message = data.choices?.[0]?.message?.content?.trim() || "";
    // Sanitize : pas de tirets cadratins, pas de ponctuation excessive
    message = message
      .replace(/[—–]/g, ",")           // em/en dash → virgule
      .replace(/!{2,}/g, "!")          // !!! → !
      .replace(/\?{2,}/g, "?")         // ??? → ?
      .replace(/\.{4,}/g, "...")       // ..... → ...
      .replace(/ {2,}/g, " ")          // double espaces
      .replace(/ ,/g, ",")
      .trim();
    if (maxEmojis === 0) {
      // Strip emojis (large emoji ranges)
      message = message.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "").replace(/ {2,}/g, " ").trim();
    }

    // Garde-fou final : au max UNE question par message.
    // On découpe en phrases, on garde toutes les phrases jusqu'à la 1re question incluse,
    // puis on stoppe (les questions suivantes sont coupées). Détecte aussi les questions
    // implicites de type "A ou B." (sans "?") en fin de phrase.
    if (!isSlotConfirmation) {
      const sentences = message.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [message];
      const looksLikeImplicitQuestion = (s: string) =>
        /\b(ou|vs)\b/i.test(s) && /\b(tu|vous|t'?es|vous êtes|préfères|préférez|veux|voulez|travailles|bosses|aimerais|aimeriez)\b/i.test(s);
      const kept: string[] = [];
      let questionFound = false;
      for (const raw of sentences) {
        const s = raw.trim();
        if (!s) continue;
        const isQuestion = s.includes("?") || looksLikeImplicitQuestion(s);
        if (isQuestion) {
          if (questionFound) break; // 2e question → on coupe
          questionFound = true;
        }
        kept.push(s);
      }
      const rebuilt = kept.join(" ").replace(/ {2,}/g, " ").trim();
      if (rebuilt) message = rebuilt;
    }

    return new Response(JSON.stringify({ message, prompt_used: promptKey, variant: variant ?? "A" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-followup-message error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
