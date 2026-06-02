// Generate 3 contextual reply suggestions for a WhatsApp conversation using Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

const DISPLAY_TIME_ZONE = "Europe/Paris";
const DAY_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Builds an availability hint to inject in the AI prompt so it never proposes
 * a closed day, a blackout (vacances), or a fully-booked day.
 * Lightweight: no Google Calendar sync (kept for generate-followup-message).
 */
async function buildAvailabilityHint(
  admin: any,
  ownerId: string,
  workspaceId: string | null,
): Promise<string> {
  try {
    const { data: settings } = await admin
      .from("availability_settings")
      .select("working_days, max_future_days, timezone, day_start_time, day_end_time")
      .eq("owner_id", ownerId)
      .maybeSingle();
    const tz: string = settings?.timezone ?? DISPLAY_TIME_ZONE;
    const workingDays: number[] = settings?.working_days ?? [1, 2, 3, 4, 5];
    const maxDays: number = settings?.max_future_days ?? 14;
    const dayStart: string = settings?.day_start_time ?? "11:00";
    const dayEnd: string = settings?.day_end_time ?? "15:00";

    const today = todayInTz(tz);
    const endDate = addDays(today, maxDays);
    const { data: blackouts } = await admin
      .from("availability_blackouts")
      .select("blackout_date")
      .eq("owner_id", ownerId)
      .gte("blackout_date", today)
      .lte("blackout_date", endDate);
    const blackoutSet = new Set<string>((blackouts ?? []).map((b: any) => b.blackout_date));

    // Closed weekdays (e.g. samedi/dimanche if not coché)
    const closedDayNames = [0, 1, 2, 3, 4, 5, 6]
      .filter((dow) => !workingDays.includes(dow))
      .map((dow) => DAY_LABELS[dow]);

    // Next 3 open days = working_days AND not blackout
    const openDays: string[] = [];
    for (let i = 0; i <= maxDays && openDays.length < 3; i++) {
      const ds = addDays(today, i);
      const dow = new Date(`${ds}T12:00:00Z`).getUTCDay();
      if (!workingDays.includes(dow)) continue;
      if (blackoutSet.has(ds)) continue;
      const d = new Date(`${ds}T12:00:00Z`);
      const full = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: DISPLAY_TIME_ZONE });
      const label = i === 0 ? "aujourd'hui" : i === 1 ? "demain" : i === 2 ? "après-demain" : full;
      openDays.push(label);
    }

    const blackoutLabels = Array.from(blackoutSet).slice(0, 10).map((ds) => {
      const d = new Date(`${ds}T12:00:00Z`);
      return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: DISPLAY_TIME_ZONE });
    });

    const lines: string[] = [];
    lines.push(`\nDISPONIBILITÉS (à respecter ABSOLUMENT) :`);
    lines.push(`- Plage horaire (heure du lead) : ${dayStart}–${dayEnd}`);
    if (closedDayNames.length) lines.push(`- Jours fermés (récurrents) : ${closedDayNames.join(", ")}`);
    if (blackoutLabels.length) lines.push(`- Jours bloqués / vacances : ${blackoutLabels.join(", ")}`);
    if (openDays.length) lines.push(`- Prochains jours ouverts : ${openDays.join(", ")}`);
    lines.push(`⚠️ N'invente JAMAIS un créneau hors plage, ne propose JAMAIS un jour fermé ou bloqué. Si tu proposes un RDV, prends un jour de la liste "Prochains jours ouverts" uniquement.`);
    lines.push(`⚠️ INTERDIT ABSOLU : ne mentionne JAMAIS de fuseau horaire (pas de "heure de Paris", "heure d'Alger", "GMT", "UTC", "fuseau", etc.). Donne juste l'heure brute (ex: "14h", "11h30") comme si vous étiez dans le même fuseau.`);
    return lines.join("\n");
  } catch (_) {
    return "";
  }
}

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
- JAMAIS de point final "." à la toute fin d'une suggestion (style WhatsApp naturel). Les "?", "!" et "..." sont OK en fin de message, mais pas le simple ".". Retire le point final si besoin.
- Pas de "n'hésite pas", "je reste à disposition", "je me permets".
- RÈGLE ABSOLUE : MAX 1 QUESTION par suggestion. Jamais 2 questions enchaînées dans la même réponse, même implicites (ex INTERDIT : "Tu es satisfait ou tu veux passer un cap. Tu bosses en équipe ou en solo ?"). Compte les "?" : 0 ou 1, jamais 2.

Réponds UNIQUEMENT avec un JSON: {"suggestions": ["réponse 1", "réponse 2", "réponse 3"]}`;
    const sys = (settings?.suggest_replies_system_prompt?.trim()) || DEFAULT_SUGGEST_PROMPT;

    // Build availability hint (uses service role since we need cross-RLS read for blackouts/settings)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const availabilityHint = lead?.owner_id
      ? await buildAvailabilityHint(admin, lead.owner_id, lead.workspace_id ?? null)
      : "";

    const userPrompt = `LEAD: ${lead?.name ?? "?"}${lead?.company_name ? ` (${lead.company_name})` : ""}
${qual?.summary ? `Résumé qualif: ${qual.summary}\n` : ""}${qual?.pain_point ? `Pain: ${qual.pain_point}\n` : ""}${qual?.urgency ? `Urgence: ${qual.urgency}\n` : ""}${Array.isArray(qual?.objections) && qual.objections.length ? `Objections: ${(qual.objections as any[]).join(', ')}\n` : ""}
Message initial du lead: ${lead?.message ?? "-"}
${availabilityHint}

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
