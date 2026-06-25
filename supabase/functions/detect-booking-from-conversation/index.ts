// Analyse la conversation WhatsApp récente et détecte si un RDV a été confirmé.
// Si oui : crée un booking + event Google Calendar + active une activity.
// Appelée en fire-and-forget depuis whatsapp-webhook après chaque message inbound.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createEventOnPrimary } from "../_shared/calendar/index.ts";
import { getMutedUserIds } from "../_shared/notificationPrefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

function formatBookingDateFr(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Paris",
    });
  } catch {
    return dateStr;
  }
}

async function sendBookingConfirmationWhatsApp(
  admin: any,
  lead: any,
  bookingDate: string,
  timeSlot: string,
  _offerName: string,
  _meetLink: string | null,
): Promise<void> {
  // Anti-doublon : si l'IA conversationnelle a DÉJÀ envoyé une confirmation dans les
  // 30 dernières minutes (message outbound contenant "noté"/"confirmé"/"bloqué" + la date/heure,
  // OU déjà un message marqué kind=booking_confirmation), on ne renvoie pas un message générique.
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentOut } = await admin
    .from("whatsapp_messages")
    .select("content, metadata, sent_at")
    .eq("lead_id", lead.id)
    .eq("direction", "outbound")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(5);
  const alreadyConfirmed = (recentOut ?? []).some((m: any) => {
    if (m?.metadata?.kind === "booking_confirmation") return true;
    const c = String(m?.content || "").toLowerCase();
    return /(c'est not[ée]|confirm[ée]|bloqu[ée]|à demain|à tout à l'heure)/i.test(c);
  });
  if (alreadyConfirmed) return;

  // Récupère config WA + dry_run
  let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
  if (lead.workspace_id) configQuery = configQuery.eq("workspace_id", lead.workspace_id);
  else configQuery = configQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
  const { data: config } = await configQuery.maybeSingle();

  let settingsQuery = admin.from("followup_automation_settings").select("dry_run");
  if (lead.workspace_id) settingsQuery = settingsQuery.eq("workspace_id", lead.workspace_id);
  else settingsQuery = settingsQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
  const { data: settings } = await settingsQuery.maybeSingle();
  const dryRun = settings?.dry_run !== false;

  const dateFr = formatBookingDateFr(bookingDate);
  const email = lead.email || "";
  // Message neutre : pas de mention "meet" (certains workspaces font des visites physiques).
  const text = `C'est noté pour ${dateFr} à ${timeSlot} ✅
${email ? `Je t'envoie la confirmation par email (${email}).` : "Je reviens vers toi rapidement avec la confirmation."}
À bientôt 🙏`;

  let waMessageId: string | null = null;
  let errorMessage: string | null = null;
  let logStatus = dryRun ? "dry_run" : "sent";

  if (!dryRun && config) {
    let phone = (lead.phone || "").replace(/[^\d+]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    if (phone.startsWith("0") && phone.length === 10) phone = "+33" + phone.slice(1);
    if (!phone.startsWith("+")) phone = "+" + phone;
    phone = phone.replace(/^\+/, "");
    if (phone) {
      try {
        const resp = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: text },
          }),
        });
        const data = await resp.json();
        if (!resp.ok) { errorMessage = JSON.stringify(data); logStatus = "failed"; }
        else { waMessageId = data.messages?.[0]?.id || null; }
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "send_failed";
        logStatus = "failed";
      }
    } else {
      errorMessage = "phone_invalid";
      logStatus = "failed";
    }
  }

  // IMPORTANT : metadata.sent_by_ai (PAS sent_by_user) → ne déclenche pas handle_manual_outbound (pas de pause)
  await admin.from("whatsapp_messages").insert({
    lead_id: lead.id,
    owner_id: lead.owner_id,
    workspace_id: lead.workspace_id ?? null,
    direction: "outbound",
    content: text,
    message_type: "text",
    status: logStatus,
    wa_message_id: waMessageId,
    error_message: errorMessage,
    metadata: { sent_by_ai: true, kind: "booking_confirmation" },
  } as any);
}

async function markLeadBookedAndStopAutomations(admin: any, lead: any, reason: string) {
  await admin.from("lead_conversation_state").upsert({
    lead_id: lead.id,
    owner_id: lead.owner_id,
    workspace_id: lead.workspace_id ?? null,
    state: "BOOKED",
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "lead_id" });

  await admin
    .from("lead_followup_tasks")
    .update({
      status: "cancelled",
      error_message: reason,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("lead_id", lead.id)
    .in("status", ["scheduled", "pending", "processing"])
    .neq("task_type", "manual_call");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "Missing lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead } = await admin
      .from("leads")
      .select("id, name, email, phone, owner_id, workspace_id, offer_id, message, notes, source, created_at, offers(name)")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alreadyBooked } = await admin
      .from("bookings")
      .select("id, booking_date, time_slot")
      .eq("lead_id", lead_id)
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alreadyBooked) {
      await markLeadBookedAndStopAutomations(admin, lead, `Booking already exists (${alreadyBooked.id})`);
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "lead_already_booked", booking_id: alreadyBooked.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Récupère les 10 derniers messages (contexte conversation)
    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("direction, content, sent_at")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(10);
    const messages = (history ?? []).reverse();
    if (messages.length < 2) {
      return new Response(JSON.stringify({ ok: true, detected: false, reason: "not_enough_messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = messages
      .map((m: any) => `[${m.direction === "inbound" ? "LEAD" : "MOI"} @ ${m.sent_at}] ${m.content}`)
      .join("\n");

    // Today / weekday computed in Europe/Paris (not UTC) so the AI never picks the wrong "dimanche".
    const parisFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
    const today = parisFmt.format(new Date()); // YYYY-MM-DD in Paris
    const parisWeekday = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" }).format(new Date());
    const detectionPrompt = `Tu analyses une conversation WhatsApp entre un commercial (MOI) et un prospect (LEAD).

Détermine si un RENDEZ-VOUS a été CONFIRMÉ. Deux cas valides :
  (A) Accord mutuel : proposition d'une partie + acceptation explicite de l'autre.
  (B) Confirmation unilatérale du commercial : le DERNIER message MOI annonce explicitement un créneau précis avec une formule du type "c'est noté", "confirmé", "je te bloque", "à lundi 17h", etc., ET le LEAD n'a pas refusé ce créneau précis APRÈS ce message.

Un simple "ok je vais y réfléchir", "peut-être", "je te rappelle" n'est PAS une confirmation.
Si le LEAD a refusé un créneau MAIS que le commercial a ensuite "noté" un autre créneau (ou le même) sans réaction négative postérieure du LEAD, considère le rendez-vous comme confirmé (cas B).

⚠️ DISTINCTION CRITIQUE — date du RDV vs date de la prestation :
- "booking_date" / "time_slot" = UNIQUEMENT la date/heure du RENDEZ-VOUS commercial (appel, visio, visite technique, estimation, devis…).
- Si le LEAD donne une date pour l'EXÉCUTION du service (ex: "je déménage dimanche 28", "livraison le 15", "intervention prévue mardi", "j'emménage le 3"), cette date NE doit JAMAIS être mise dans "booking_date". Mets-la plutôt dans "lead_summary" (ex: "déménagement prévu le 28").
- Ne considère "confirmed=true" QUE si un VRAI rendez-vous (visite, appel, visio…) a été calé avec une date+heure précises. Une simple date de prestation sans RDV planifié ⇒ confirmed=false, booking_date=null, time_slot=null.

Date du jour : ${today} (${parisWeekday}, timezone Europe/Paris, horaires 11h–15h30 jours ouvrés).
IMPORTANT : "dimanche" = le PROCHAIN dimanche À PARTIR de la date du jour ci-dessus. Si aujourd'hui est déjà ce jour-là, c'est aujourd'hui (pas la semaine suivante). Ne jamais ajouter +1 jour par sécurité.

Réponds UNIQUEMENT en JSON :
{
  "confirmed": true|false,
  "booking_date": "YYYY-MM-DD" | null,
  "time_slot": "HH:MM" | null,
  "address": "adresse complète mentionnée par le lead (rue, numéro, ville) ou null si non mentionnée",
  "lead_summary": "résumé en 2-3 phrases : besoin / contexte / infos clés (volume, date, budget…)",
  "reason": "courte explication"
}

Conversation :
${transcript}`;

    const aiRes = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: detectionPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      console.error("AI detection failed:", await aiRes.text());
      return new Response(JSON.stringify({ ok: false, error: "ai_error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(aiData.choices?.[0]?.message?.content ?? "{}");
    } catch (_) {
      parsed = {};
    }

    if (!parsed.confirmed || !parsed.booking_date || !parsed.time_slot) {
      return new Response(
        JSON.stringify({ ok: true, detected: false, reason: parsed.reason ?? "not_confirmed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Vérifier qu'un booking pour ce lead/créneau n'existe pas déjà (idempotence)
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("booking_date", parsed.booking_date)
      .eq("time_slot", parsed.time_slot)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      await markLeadBookedAndStopAutomations(admin, lead, `Booking already exists (${existing.id})`);
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "booking_already_exists", booking_id: existing.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let resolvedOfferId: string | null = lead.offer_id ?? null;
    let offerName = (lead as any).offers?.name ?? "Consultation";

    // Fallback : si le lead n'a pas d'offre liée, on prend la 1ère offre active du workspace/owner
    if (!resolvedOfferId) {
      let fallbackQuery = admin
        .from("offers")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (lead.workspace_id) {
        fallbackQuery = fallbackQuery.eq("workspace_id", lead.workspace_id);
      } else {
        fallbackQuery = fallbackQuery.eq("owner_id", lead.owner_id);
      }
      const { data: fallbackOffer } = await fallbackQuery.maybeSingle();
      if (fallbackOffer) {
        resolvedOfferId = fallbackOffer.id;
        offerName = fallbackOffer.name;
        // Lier l'offre au lead pour les automatisations futures
        await admin.from("leads").update({ offer_id: resolvedOfferId } as any).eq("id", lead.id);
      }
    }

    // ⚠️ Plus aucun offre ? On crée quand même le booking (offer_id = null).
    // L'utilisateur pourra lier l'offre plus tard depuis le backoffice.
    if (!resolvedOfferId) {
      offerName = "Rendez-vous";
    }



    // Créer event calendrier sur le compte principal du workspace si disponible
    let googleEventId: string | null = null;
    let meetLink: string | null = null;
    if (lead.workspace_id) {
      const { data: availability } = await admin
        .from("availability_settings")
        .select("timezone, slot_duration_minutes")
        .eq("workspace_id", lead.workspace_id)
        .maybeSingle();
      const calendarTimeZone = availability?.timezone || "Europe/Paris";
      const durationMinutes = availability?.slot_duration_minutes || 60;
      const [hh, mm] = parsed.time_slot.split(":").map(Number);
      const endTotal = hh * 60 + mm + durationMinutes;
      const endLocal = `${parsed.booking_date}T${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:00`;
      const result = await createEventOnPrimary(lead.workspace_id, {
        summary: `RDV - ${lead.name} (${offerName})`,
        description: `Rendez-vous avec ${lead.name}${lead.email ? ` (${lead.email})` : ""} pour "${offerName}" — détecté automatiquement depuis WhatsApp.`,
        startISO: `${parsed.booking_date}T${parsed.time_slot}:00`,
        endISO: endLocal,
        timeZone: calendarTimeZone,
        attendees: lead.email ? [{ email: lead.email, displayName: lead.name }] : [],
        createMeetLink: true,
      }).catch((err) => {
        console.error("Workspace calendar event creation failed:", err);
        return null;
      });
      if (result) {
        googleEventId = result.externalEventId;
        meetLink = result.meetLink || null;
      }
    }

    // Créer le booking
    const bookingId = crypto.randomUUID();
    const { error: bookingErr } = await admin.from("bookings").insert({
      id: bookingId,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      offer_id: resolvedOfferId,
      lead_id: lead.id,
      name: lead.name,
      email: lead.email || `${lead.phone}@whatsapp.tmp`,
      phone: lead.phone || "",
      booking_date: parsed.booking_date,
      time_slot: parsed.time_slot,
      notes: `RDV confirmé par IA depuis WhatsApp.${parsed.address ? `\n📍 Adresse : ${parsed.address}` : ""}${parsed.lead_summary ? `\n\n📝 Résumé : ${parsed.lead_summary}` : ""}${parsed.reason ? `\n\n💡 ${parsed.reason}` : ""}`,
      status: "confirmed",
      google_event_id: googleEventId,
      meet_link: meetLink,
      created_from: "conversation_ai",
    } as any);

    if (bookingErr) {
      console.error("Booking insert error:", bookingErr);
      return new Response(JSON.stringify({ ok: false, error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await markLeadBookedAndStopAutomations(admin, lead, `Booking auto-created (${bookingId})`);

    // Schedule reminder emails (confirmation + 24h/12h/1h before) so admin & client get notified.
    // Mirrors logic in handle-booking. created_from=conversation_ai bookings previously skipped this.
    try {
      const parisOffsetHours = (() => {
        const probe = new Date(`${parsed.booking_date}T12:00:00Z`);
        const parisHour = parseInt(new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Paris", hour: "2-digit", hour12: false,
        }).format(probe));
        const utcHour = probe.getUTCHours();
        let diff = parisHour - utcHour;
        if (diff > 12) diff -= 24;
        if (diff < -12) diff += 24;
        return diff;
      })();
      const [hh, mm] = parsed.time_slot.split(":").map(Number);
      const bookingDateTime = new Date(
        `${parsed.booking_date}T${String(hh - parisOffsetHours).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`
      );

      const emailSchedules = [
        { type: "24h_before", scheduled_at: new Date(bookingDateTime.getTime() - 24 * 3600 * 1000).toISOString() },
        { type: "12h_before", scheduled_at: new Date(bookingDateTime.getTime() - 12 * 3600 * 1000).toISOString() },
        { type: "1h_before", scheduled_at: new Date(bookingDateTime.getTime() - 1 * 3600 * 1000).toISOString() },
      ];

      // Send confirmation email to the prospect via SMTP (transactional gateway blocked by DNS)
      if (lead.email && !lead.email.endsWith("@whatsapp.tmp")) {
        try {
          const dateStr = new Date(parsed.booking_date + "T12:00:00Z").toLocaleDateString("fr-FR", {
            day: "2-digit", month: "long", year: "numeric",
          });
          const meetBlock = meetLink
            ? `<p><a href="${meetLink}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a></p>`
            : "";
          const subject = `✅ Votre rendez-vous est confirmé — ${dateStr} à ${parsed.time_slot}`;
          const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px;font-size:14px;line-height:1.6">
    <p>Bonjour ${lead.name || ""},</p>
    <p>Votre rendez-vous est bien confirmé pour le <strong>${dateStr} à ${parsed.time_slot}</strong>${offerName ? ` (${offerName})` : ""}.</p>
    ${meetBlock}
    <p>À très vite !</p>
  </div>
</body></html>`;
          await admin.functions.invoke("send-smtp-email", {
            body: { to: [lead.email], subject, html },
          });
          await admin.from("email_send_log").insert({
            template_name: "booking-confirmation",
            recipient_email: lead.email,
            status: "sent",
            message_id: `booking-confirmation-${bookingId}`,
            metadata: { booking_id: bookingId, type: "confirmation", automated: true, source: "wa_ai" },
          } as any);
        } catch (e) {
          console.error("[detect-booking] booking-confirmation email failed:", e);
        }
      }

      // Notify the workspace owner + members by email (same gap as handle-booking covers for forms)
      try {
        const APP_BASE_URL = "https://digital-launch-crm.lovable.app";
        const ADMIN_NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
        const bookingUrl = `${APP_BASE_URL}/leads/${lead.id}`;
        const userEmailMap = new Map<string, string>();
        const memberUserIds: string[] = [];
        let workspaceName: string | null = null;
        let workspaceEmail: string | null = null;
        if (lead.workspace_id) {
          const { data: ws } = await admin
            .from("workspaces")
            .select("company_name, notification_email, email")
            .eq("id", lead.workspace_id)
            .maybeSingle();
          workspaceName = ws?.company_name || null;
          workspaceEmail = (ws?.notification_email || ws?.email || "").trim() || null;
          const { data: members } = await admin
            .from("workspace_members").select("user_id").eq("workspace_id", lead.workspace_id);
          for (const m of members || []) {
            memberUserIds.push(m.user_id);
            try {
              const { data: u } = await admin.auth.admin.getUserById(m.user_id);
              if (u?.user?.email) userEmailMap.set(m.user_id, u.user.email);
            } catch (_) { /* noop */ }
          }
        } else {
          memberUserIds.push(lead.owner_id);
          try {
            const { data: u } = await admin.auth.admin.getUserById(lead.owner_id);
            if (u?.user?.email) userEmailMap.set(lead.owner_id, u.user.email);
          } catch (_) { /* noop */ }
        }
        const mutedEmail = await getMutedUserIds(admin, lead.workspace_id, memberUserIds, "email");
        const memberEmails = memberUserIds
          .filter((uid) => !mutedEmail.has(uid))
          .map((uid) => userEmailMap.get(uid))
          .filter((e): e is string => !!e);
        const recipients = Array.from(new Set(
          [ADMIN_NOTIFY_EMAIL, workspaceEmail, ...memberEmails].filter((e): e is string => !!e)
        ));
        if (recipients.length > 0) {
          const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
          const subject = `📅 ${wsPrefix}Nouveau RDV (WhatsApp) — ${lead.name} (${parsed.booking_date} ${parsed.time_slot})`;
          const meetRow = meetLink
            ? `<p style="margin:6px 0"><a href="${meetLink}" style="color:#7c3aed;font-weight:600">🔗 Google Meet</a></p>` : "";
          const addressRow = parsed.address
            ? `<p style="margin:4px 0"><strong>📍 Adresse :</strong> ${String(parsed.address).replace(/[<>]/g, "")}</p>` : "";
          const escapeHtml = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          // Récap clair du formulaire initial (et notes) → bien plus lisible que la conversation complète
          const formText = String(lead.message || "").trim();
          const notesText = String(lead.notes || "").trim();
          const formBlock = (formText || notesText)
            ? `<div style="background:#eff6ff;border-radius:8px;padding:12px 16px;margin:12px 0;border-left:3px solid #2563eb">
                 <p style="margin:0 0 6px;font-weight:600;color:#1e40af">📋 Détails du formulaire initial</p>
                 ${formText ? `<div style="color:#1e3a8a;white-space:pre-wrap;font-size:13px">${escapeHtml(formText)}</div>` : ""}
                 ${notesText ? `<div style="color:#1e3a8a;white-space:pre-wrap;font-size:13px;margin-top:8px"><strong>Notes :</strong> ${escapeHtml(notesText)}</div>` : ""}
               </div>` : "";
          const summaryBlock = parsed.lead_summary
            ? `<div style="background:#fef3c7;border-radius:8px;padding:12px 16px;margin:12px 0;border-left:3px solid #f59e0b">
                 <p style="margin:0 0 4px;font-weight:600;color:#92400e">🆕 Infos apprises pendant la conversation</p>
                 <p style="margin:0;color:#451a03;white-space:pre-wrap">${escapeHtml(parsed.lead_summary)}</p>
               </div>` : "";
          const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0;color:#111827">
  <div style="max-width:640px;margin:0 auto;padding:28px 24px;font-size:14px;line-height:1.6">
    <h1 style="font-size:20px;margin:0 0 12px">📅 Nouveau RDV (auto-détecté via WhatsApp)</h1>
    ${workspaceName ? `<div style="font-size:13px;color:#6b7280;margin:0 0 12px">Espace : ${escapeHtml(workspaceName)}</div>` : ""}
    <div style="background:#f9fafb;border-radius:8px;padding:16px 18px;margin:12px 0;border-left:3px solid #7c3aed">
      <p style="margin:4px 0"><strong>Lead :</strong> ${escapeHtml(lead.name || "")}</p>
      ${lead.email ? `<p style="margin:4px 0"><strong>Email :</strong> ${escapeHtml(lead.email)}</p>` : ""}
      ${lead.phone ? `<p style="margin:4px 0"><strong>Téléphone :</strong> ${escapeHtml(lead.phone)}</p>` : ""}
      <p style="margin:4px 0"><strong>Créneau :</strong> ${parsed.booking_date} à ${parsed.time_slot}</p>
      <p style="margin:4px 0"><strong>Offre :</strong> ${escapeHtml(offerName)}</p>
      ${addressRow}
      ${meetRow}
    </div>
    ${formBlock}
    ${summaryBlock}
    <p style="margin-top:20px"><a href="${bookingUrl}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block">Ouvrir la fiche lead</a></p>
  </div>
</body></html>`;
          await admin.functions.invoke("send-smtp-email", {
            body: { to: recipients, subject, html, replyTo: lead.email || undefined },
          });
          await admin.from("email_send_log").insert({
            template_name: "booking-admin-notify",
            recipient_email: recipients.join(","),
            status: "sent",
            message_id: `booking-admin-notify-${bookingId}`,
            metadata: { booking_id: bookingId, lead_id: lead.id, recipients, automated: true, source: "wa_ai" },
          } as any);
        }
      } catch (e) {
        console.error("[detect-booking] owner notification email failed:", e);
      }

      // Respect enabled/disabled toggles (offer override > workspace default)
      const { data: offerTplRows } = await admin
        .from("offer_booking_email_templates").select("type, enabled").eq("offer_id", resolvedOfferId);
      const offerByType = new Map<string, { enabled: boolean }>();
      (offerTplRows || []).forEach((r: any) => offerByType.set(r.type, { enabled: r.enabled }));
      const wsByType = new Map<string, { enabled: boolean }>();
      if (lead.workspace_id) {
        const { data: wsTplRows } = await admin
          .from("workspace_booking_email_templates").select("type, enabled").eq("workspace_id", lead.workspace_id);
        (wsTplRows || []).forEach((r: any) => wsByType.set(r.type, { enabled: r.enabled }));
      }
      const disabled = new Set<string>();
      for (const es of emailSchedules) {
        if (offerByType.has(es.type)) {
          if (offerByType.get(es.type)!.enabled === false) disabled.add(es.type);
        } else if (wsByType.has(es.type)) {
          if (wsByType.get(es.type)!.enabled === false) disabled.add(es.type);
        }
      }
      const inserts = emailSchedules
        .filter((es) => !disabled.has(es.type))
        .map((es) => ({ booking_id: bookingId, type: es.type, scheduled_at: es.scheduled_at, status: "pending" }));
      if (inserts.length > 0) {
        const { error: emailErr } = await admin.from("booking_emails").insert(inserts as any);
        if (emailErr) console.error("booking_emails insert error:", emailErr);
      }

      // Backfill the same reminders rows that handle-booking creates (4h + 1h before)
      for (const rt of [{ offset: 4 * 3600 * 1000, label: "4h avant" }, { offset: 1 * 3600 * 1000, label: "1h avant" }]) {
        const due = new Date(bookingDateTime.getTime() - rt.offset);
        if (due > new Date()) {
          await admin.from("reminders").insert({
            owner_id: lead.owner_id,
            lead_id: lead.id,
            due_date: due.toISOString(),
            action: `RDV ${rt.label} — ${lead.name} (${parsed.time_slot})`,
          } as any);
        }
      }
    } catch (e) {
      console.error("[detect-booking] schedule reminders failed:", e);
    }

    // Envoie un message de confirmation chaleureux au prospect (évite l'effet "ghosted")
    try {
      await sendBookingConfirmationWhatsApp(admin, lead, parsed.booking_date, parsed.time_slot, offerName, meetLink);
    } catch (e) {
      console.error("booking confirmation WA failed:", e);
    }

    // Activity + notif owner
    await admin.from("lead_activities").insert({
      lead_id: lead.id,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      activity_type: "meeting",
      description: `📅 RDV auto-détecté via WhatsApp : ${parsed.booking_date} à ${parsed.time_slot}${meetLink ? ` — ${meetLink}` : ""}`,
    } as any);

    // Push notif owner (respecte la préférence par workspace)
    try {
      const mutedPush = await getMutedUserIds(admin, lead.workspace_id, [lead.owner_id], "push");
      if (!mutedPush.has(lead.owner_id)) {
        await admin.functions.invoke("send-onesignal-notification", {
          body: {
            user_id: lead.owner_id,
            title: `📅 RDV auto-créé — ${lead.name}`,
            body: `${parsed.booking_date} à ${parsed.time_slot} • ${offerName}`,
            url: `/bookings`,
            tag: `ai-booking-${bookingId}`.slice(0, 32),
          },
        });
      }
    } catch (e) {
      console.error("Push notif failed:", e);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        detected: true,
        booking_id: bookingId,
        booking_date: parsed.booking_date,
        time_slot: parsed.time_slot,
        google_synced: !!googleEventId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("detect-booking-from-conversation error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
