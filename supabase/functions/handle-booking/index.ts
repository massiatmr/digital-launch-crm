import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createEventOnPrimary } from "../_shared/calendar/index.ts";
import { getMutedUserIds } from "../_shared/notificationPrefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function markLeadBookedAndStopAutomations(supabase: any, leadId: string, ownerId: string) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .maybeSingle();

  await supabase.from("lead_conversation_state").upsert({
    lead_id: leadId,
    owner_id: ownerId,
    workspace_id: lead?.workspace_id ?? null,
    state: "BOOKED",
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "lead_id" });

  await supabase
    .from("lead_followup_tasks")
    .update({
      status: "cancelled",
      error_message: "Skipped: booking already exists from public link",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("lead_id", leadId)
    .in("status", ["scheduled", "pending", "processing"])
    .neq("task_type", "manual_call");
}

function addMinutesToTimeSlot(timeSlot: string, minutesToAdd: number): string {
  const [h, m] = timeSlot.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, booking_date, time_slot, offer_id, notes, client_timezone } = await req.json();

    if (!name || !email || !phone || !booking_date || !time_slot || !offer_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Derive owner_id server-side from the active offer (prevents cross-tenant booking creation).
    const { data: offer } = await supabase
      .from("offers")
      .select("name, owner_id, workspace_id")
      .eq("id", offer_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!offer?.owner_id) {
      return new Response(
        JSON.stringify({ error: "Offer not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const owner_id = offer.owner_id;
    const offer_workspace_id = (offer as any).workspace_id || null;
    const offerName = offer.name || "Consultation";
    let calendarTimeZone = "Europe/Paris";
    let calendarDurationMinutes = 60;
    if (offer_workspace_id) {
      const { data: availability } = await supabase
        .from("availability_settings")
        .select("timezone, slot_duration_minutes")
        .eq("workspace_id", offer_workspace_id)
        .maybeSingle();
      calendarTimeZone = availability?.timezone || calendarTimeZone;
      calendarDurationMinutes = availability?.slot_duration_minutes || calendarDurationMinutes;
    }

    // Try to create calendar event on the workspace primary calendar account
    let googleEventId: string | null = null;
    let meetLink: string | null = null;

    if (offer_workspace_id) {
      const endTimeSlot = addMinutesToTimeSlot(time_slot, calendarDurationMinutes);
      const calendarResult = await createEventOnPrimary(offer_workspace_id, {
        summary: `RDV - ${name} (${offerName})`,
        description: `Rendez-vous avec ${name} (${email}) pour l'offre "${offerName}"`,
        startISO: `${booking_date}T${time_slot}:00`,
        endISO: `${booking_date}T${endTimeSlot}:00`,
        timeZone: calendarTimeZone,
        attendees: [{ email, displayName: name }],
        createMeetLink: true,
      }).catch((err) => {
        console.error("Workspace calendar event creation failed:", err);
        return null;
      });
      if (calendarResult) {
        googleEventId = calendarResult.externalEventId;
        meetLink = calendarResult.meetLink || null;
        console.log("Calendar event created:", googleEventId, "Meet:", meetLink);
      }
    } else {
      console.log("No workspace on offer, skipping calendar sync");
    }

    // 1. Create the booking
    const bookingId = crypto.randomUUID();
    const { error: bookingError } = await supabase.from("bookings").insert({
      id: bookingId,
      owner_id,
      workspace_id: offer_workspace_id,
      offer_id,
      name,
      email,
      phone: phone || "",
      booking_date,
      time_slot,
      notes: notes || "",
      status: "pending",
      google_event_id: googleEventId,
      meet_link: meetLink,
      client_timezone: client_timezone || null,
    });

    if (bookingError) {
      console.error("Booking insert error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Failed to create booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find an existing lead: match by email OR phone within the same workspace/owner.
    // Avoids creating a duplicate when the landing page already submitted the lead
    // via /landing-lead before the booking step.
    const normPhone = (phone || "").replace(/[^\d+]/g, "");
    let leadQuery = supabase
      .from("leads")
      .select("id, email, phone, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (offer_workspace_id) {
      leadQuery = leadQuery.eq("workspace_id", offer_workspace_id);
    } else {
      leadQuery = leadQuery.eq("owner_id", owner_id);
    }
    const orParts: string[] = [];
    if (email) orParts.push(`email.eq.${email}`);
    if (normPhone) orParts.push(`phone.eq.${normPhone}`);
    if (orParts.length) leadQuery = leadQuery.or(orParts.join(","));
    const { data: candidates } = orParts.length ? await leadQuery : { data: [] as any[] };
    const existingLead = (candidates && candidates.length > 0) ? candidates[0] : null;

    let leadId: string;

    if (existingLead) {
      leadId = existingLead.id;
      await supabase
        .from("leads")
        .update({
          offer_id,
          status: "qualified",
          last_contacted_at: new Date().toISOString(),
          ...(existingLead.phone ? {} : { phone: normPhone }),
          ...(existingLead.email ? {} : { email }),
        } as any)
        .eq("id", leadId);
    } else {
      leadId = crypto.randomUUID();
      await supabase.from("leads").insert({
        id: leadId,
        owner_id,
        workspace_id: offer_workspace_id,
        name,
        email,
        phone: normPhone,
        source: "website",
        score: "warm",
        status: "qualified",
        offer_id,
        message: `Réservation RDV le ${booking_date} à ${time_slot}`,
      });
    }


    // Update booking with lead_id
    await supabase
      .from("bookings")
      .update({ lead_id: leadId })
      .eq("id", bookingId);

    await markLeadBookedAndStopAutomations(supabase, leadId, owner_id);

    // 3. Schedule nurturing emails
    // Convert Paris wall-clock (booking_date + time_slot) to a real UTC instant.
    // Paris is UTC+1 in winter, UTC+2 in summer (DST). We compute the offset by
    // formatting a probe Date with the Europe/Paris timezone.
    const parisOffsetHours = (() => {
      const probe = new Date(`${booking_date}T${time_slot}:00Z`);
      // Get the wall-clock hour Paris would show for that UTC instant.
      const parisHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          hour12: false,
        }).format(probe)
      );
      const utcHour = probe.getUTCHours();
      // Difference (handles day wrap)
      let diff = parisHour - utcHour;
      if (diff > 12) diff -= 24;
      if (diff < -12) diff += 24;
      return diff; // 1 (CET) or 2 (CEST)
    })();
    const [hh, mm] = time_slot.split(":").map(Number);
    const bookingDateTime = new Date(
      `${booking_date}T${String(hh - parisOffsetHours).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`
    );

    const emailSchedules: Array<{
      type: "confirmation" | "24h_before" | "12h_before" | "1h_before" | "5min_before";
      scheduled_at: string;
    }> = [
      { type: "confirmation", scheduled_at: new Date().toISOString() },
      { type: "24h_before", scheduled_at: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString() },
      { type: "12h_before", scheduled_at: new Date(bookingDateTime.getTime() - 12 * 60 * 60 * 1000).toISOString() },
      { type: "1h_before", scheduled_at: new Date(bookingDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString() },
      { type: "5min_before", scheduled_at: new Date(bookingDateTime.getTime() - 5 * 60 * 1000).toISOString() },
    ];

    // Charge les overrides offre + workspace pour respecter les toggles enabled
    const { data: offerTplRows } = await supabase
      .from("offer_booking_email_templates")
      .select("type, enabled")
      .eq("offer_id", offer_id);
    const offerByType = new Map<string, { enabled: boolean }>();
    (offerTplRows || []).forEach((r: any) => offerByType.set(r.type, { enabled: r.enabled }));

    const wsByType = new Map<string, { enabled: boolean }>();
    if (offer_workspace_id) {
      const { data: wsTplRows } = await supabase
        .from("workspace_booking_email_templates")
        .select("type, enabled")
        .eq("workspace_id", offer_workspace_id);
      (wsTplRows || []).forEach((r: any) => wsByType.set(r.type, { enabled: r.enabled }));
    }

    const disabledTypes = new Set<string>();
    for (const es of emailSchedules) {
      // offer override wins; else workspace default; else enabled true
      if (offerByType.has(es.type)) {
        if (offerByType.get(es.type)!.enabled === false) disabledTypes.add(es.type);
      } else if (wsByType.has(es.type)) {
        if (wsByType.get(es.type)!.enabled === false) disabledTypes.add(es.type);
      }
    }

    const emailInserts = emailSchedules
      .filter((es) => !disabledTypes.has(es.type))
      .map((es) => ({
        booking_id: bookingId,
        type: es.type,
        scheduled_at: es.scheduled_at,
        status: "pending",
      }));

    if (emailInserts.length > 0) {
      const { error: emailError } = await supabase.from("booking_emails").insert(emailInserts);
      if (emailError) console.error("Email schedule error:", emailError);
    }

    // 3.bis - Plannifier les rappels WhatsApp (template HSM). Le cron filtrera selon enabled + phone + template configuré.
    const waInserts = emailSchedules.map((es) => ({
      booking_id: bookingId,
      type: es.type,
      scheduled_at: es.scheduled_at,
      status: "pending",
    }));
    if (waInserts.length > 0) {
      const { error: waErr } = await supabase.from("booking_wa_reminders").insert(waInserts);
      if (waErr) console.error("WA reminders schedule error:", waErr);
    }

    // 4. Create reminders
    const reminderTimes = [
      { offset: 4 * 60 * 60 * 1000, label: "4h avant" },
      { offset: 1 * 60 * 60 * 1000, label: "1h avant" },
    ];

    for (const rt of reminderTimes) {
      const dueDate = new Date(bookingDateTime.getTime() - rt.offset);
      if (dueDate > new Date()) {
        await supabase.from("reminders").insert({
          owner_id,
          lead_id: leadId,
          due_date: dueDate.toISOString(),
          action: `RDV ${rt.label} — ${name} (${time_slot})`,
        });
      }
    }

    // 5. Add activity
    const meetInfo = meetLink ? ` — Google Meet: ${meetLink}` : "";
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      owner_id,
      activity_type: "meeting",
      description: `RDV réservé le ${booking_date} à ${time_slot}${meetInfo}`,
    });

    // 6. Send booking confirmation email to the prospect via SMTP
    //    (Lovable's transactional email gateway is blocked until the sender
    //    domain finishes DNS verification, so we route the confirmation
    //    through the same SMTP path used by reminders and manual sends.)
    try {
      const DEFAULTS = {
        subject: "✅ Votre rendez-vous est confirmé — {{date}} à {{time}}",
        body_html: `<p>Bonjour {{name}},</p><p>Votre rendez-vous est bien confirmé pour le <strong>{{date}} à {{time}}</strong>{{offer_suffix}}.</p><p>{{meet_block}}</p><p>À très vite !</p>`,
      };

      // Resolve template: offer override > workspace default > built-in
      let tplEnabled = true;
      let tplSubject = DEFAULTS.subject;
      let tplBody = DEFAULTS.body_html;
      let resolved = false;
      if (offer_id) {
        const { data: tpl } = await supabase
          .from("offer_booking_email_templates")
          .select("enabled, subject, body_html")
          .eq("offer_id", offer_id)
          .eq("type", "confirmation")
          .maybeSingle();
        if (tpl) {
          resolved = true;
          tplEnabled = (tpl as any).enabled !== false;
          if ((tpl as any).subject) tplSubject = (tpl as any).subject;
          if ((tpl as any).body_html) tplBody = (tpl as any).body_html;
        }
      }
      if (!resolved && offer_workspace_id) {
        const { data: wsTpl } = await supabase
          .from("workspace_booking_email_templates")
          .select("enabled, subject, body_html")
          .eq("workspace_id", offer_workspace_id)
          .eq("type", "confirmation")
          .maybeSingle();
        if (wsTpl) {
          tplEnabled = (wsTpl as any).enabled !== false;
          if ((wsTpl as any).subject) tplSubject = (wsTpl as any).subject;
          if ((wsTpl as any).body_html) tplBody = (wsTpl as any).body_html;
        }
      }

      if (tplEnabled && email) {
        const dateStr = new Date(booking_date + "T12:00:00Z").toLocaleDateString("fr-FR", {
          day: "2-digit", month: "long", year: "numeric",
        });
        const meetBlock = meetLink
          ? `<a href="${meetLink}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a>`
          : "";
        const vars: Record<string, string> = {
          name: name || "",
          date: dateStr,
          time: time_slot || "",
          offer_name: offerName || "",
          offer_suffix: offerName ? ` (${offerName})` : "",
          meet_link: meetLink || "",
          meet_block: meetBlock,
        };
        const render = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
        const subject = render(tplSubject);
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px;font-size:14px;line-height:1.6">${render(tplBody)}</div>
</body></html>`;

        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const msgId = `booking-confirmation-${bookingId}`;
        const { error: sendErr } = await supabase.functions.invoke("send-smtp-email", {
          body: { to: [email], subject, html, workspaceId: offer_workspace_id },
          headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        if (sendErr) throw sendErr;

        await supabase.from("email_send_log").insert({
          template_name: "booking-confirmation",
          recipient_email: email,
          status: "sent",
          message_id: msgId,
          metadata: { booking_id: bookingId, type: "confirmation", automated: true, subject, body_html: html },
        });

        // Mark the scheduled confirmation row as sent so it isn't re-processed
        await supabase
          .from("booking_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() } as any)
          .eq("booking_id", bookingId)
          .eq("type", "confirmation")
          .eq("status", "pending");

        console.log("Booking confirmation email sent to:", email);
      }
    } catch (emailErr) {
      console.error("Failed to send booking confirmation email:", emailErr);
    }

    // 7. Notify the owner + all workspace members (push + email via SMTP)
    const APP_BASE_URL = "https://digital-launch-crm.lovable.app";
    const ADMIN_NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
    const bookingUrl = `${APP_BASE_URL}/leads/${leadId}`;
    const titleSuffix = offerName ? ` — ${offerName}` : "";
    const meetRow = meetLink
      ? `<p style="font-size:12px;color:#7c3aed;font-weight:600;margin:8px 0 2px;text-transform:uppercase;letter-spacing:0.5px">🔗 Google Meet</p>
         <p style="font-size:14px;color:#1a1a2e;margin:0 0 8px"><a href="${meetLink}" style="color:#7c3aed">${meetLink}</a></p>`
      : "";

    // Fetch full lead context: lead row, qualification, activities, workspace
    const { data: leadFull } = await supabase
      .from("leads")
      .select("workspace_id, source, message, notes, ai_summary, sales_angle, score, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id, meta_page_id, created_at")
      .eq("id", leadId)
      .maybeSingle();

    const { data: qualification } = await supabase
      .from("lead_qualification")
      .select("interest_level, intent, urgency, budget_signal, decision_maker, pain_point, summary, objections")
      .eq("lead_id", leadId)
      .maybeSingle();

    const { data: activities } = await supabase
      .from("lead_activities")
      .select("activity_type, description, lead_response, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(8);

    // Resolve workspace + members
    let workspaceName: string | null = null;
    let workspaceEmail: string | null = null;
    const userEmailMap = new Map<string, string>();
    const memberUserIds: string[] = [];
    if (leadFull?.workspace_id) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("company_name, notification_email, email")
        .eq("id", leadFull.workspace_id)
        .maybeSingle();
      workspaceName = ws?.company_name || null;
      workspaceEmail = (ws?.notification_email || ws?.email || "").trim() || null;

      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", leadFull.workspace_id);

      for (const m of members || []) {
        memberUserIds.push(m.user_id);
        try {
          const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
          if (u?.user?.email) userEmailMap.set(m.user_id, u.user.email);
        } catch (e) {
          console.error("getUserById failed for", m.user_id, e);
        }
      }
    }

    // Per-user, per-workspace mute (admin can mute a client workspace).
    const mutedEmail = await getMutedUserIds(supabase, leadFull?.workspace_id, memberUserIds, "email_booking");
    const mutedPush = await getMutedUserIds(supabase, leadFull?.workspace_id, memberUserIds, "push");
    const memberEmails = memberUserIds
      .filter((uid) => !mutedEmail.has(uid))
      .map((uid) => userEmailMap.get(uid))
      .filter((e): e is string => !!e);

    const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
    const recipients = Array.from(new Set(
      [ADMIN_NOTIFY_EMAIL, workspaceEmail, ...memberEmails].filter((e): e is string => !!e)
    ));

    // Push to all workspace members via OneSignal (respect mute)
    const pushTargetsRaw = Array.from(new Set([owner_id, ...memberUserIds]));
    const pushTargets = pushTargetsRaw.filter((uid) => !mutedPush.has(uid));
    for (const uid of pushTargets) {
      try {
        await supabase.functions.invoke("send-onesignal-notification", {
          body: {
            user_id: uid,
            title: `📅 ${wsPrefix}Nouveau RDV — ${name}`,
            body: `${booking_date} à ${time_slot} • ${offerName}`,
            url: `/leads/${leadId}`,
            tag: `new-booking-${bookingId}`.slice(0, 32),
          },
        });
      } catch (e) {
        console.error("Member push failed:", uid, e);
      }
    }

    // Build rich email blocks
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const row = (label: string, value: string | null | undefined) =>
      value ? `<p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">${label}</p>
              <p style="font-size:14px;color:#111827;margin:0 0 8px;white-space:pre-wrap">${escapeHtml(value)}</p>` : "";

    const sourceLabel = leadFull?.source ? String(leadFull.source) : "—";
    const metaInfo = (leadFull?.meta_campaign_id || leadFull?.meta_form_id) ? `Campaign: ${leadFull.meta_campaign_id || '—'} • Ad: ${leadFull.meta_ad_id || '—'} • Form: ${leadFull.meta_form_id || '—'}` : null;

    const qualificationBlock = qualification ? `
      <div style="background:#f5f3ff;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #7c3aed">
        <p style="font-size:12px;color:#7c3aed;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Qualification IA</p>
        ${row("Intérêt", qualification.interest_level != null ? `${qualification.interest_level}/100` : null)}
        ${row("Intention", qualification.intent)}
        ${row("Urgence", qualification.urgency)}
        ${row("Budget", qualification.budget_signal)}
        ${row("Décisionnaire", qualification.decision_maker)}
        ${row("Pain point", qualification.pain_point)}
        ${row("Résumé", qualification.summary)}
        ${Array.isArray(qualification.objections) && qualification.objections.length ? row("Objections", (qualification.objections as string[]).join(" • ")) : ""}
      </div>` : "";

    const activitiesBlock = (activities && activities.length) ? `
      <div style="background:#f9fafb;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #d1d5db">
        <p style="font-size:12px;color:#6b7280;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Dernières interactions</p>
        ${activities.map(a => `
          <div style="margin:0 0 10px">
            <p style="font-size:12px;color:#6b7280;margin:0">${new Date(a.created_at).toLocaleString('fr-FR')} — <strong>${a.activity_type}</strong></p>
            <p style="font-size:13px;color:#111827;margin:2px 0 0;white-space:pre-wrap">${escapeHtml(a.description || '')}</p>
            ${a.lead_response ? `<p style="font-size:13px;color:#7c3aed;margin:4px 0 0;font-style:italic;white-space:pre-wrap">↳ ${escapeHtml(a.lead_response)}</p>` : ''}
          </div>
        `).join("")}
      </div>` : "";

    const formAnswersBlock = leadFull?.message ? `
      <div style="background:#fffbeb;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #f59e0b">
        <p style="font-size:12px;color:#b45309;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Réponses formulaire / message</p>
        <p style="font-size:13px;color:#111827;margin:0;white-space:pre-wrap">${escapeHtml(leadFull.message)}</p>
      </div>` : "";

    // Email to admin + workspace + all members via SMTP
    try {
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:620px;margin:0 auto;padding:30px 25px">
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 6px">📅 Nouveau RDV${titleSuffix}</h1>
    ${workspaceName ? `<div style="font-size:13px;color:#6b7280;margin:0 0 16px">Espace : ${workspaceName}</div>` : ""}
    <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">
      Un prospect vient de prendre rendez-vous. Voici le dossier complet pour préparer l'appel.
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:18px 22px;margin:18px 0;border-left:3px solid #111827">
      ${row("Nom", name)}
      ${row("Email", email)}
      ${row("Téléphone", phone)}
      ${row("Créneau", `${booking_date} à ${time_slot}`)}
      ${row("Offre", offerName)}
      ${row("Source", sourceLabel)}
      ${row("Score", leadFull?.score)}
      ${row("Statut", leadFull?.status)}
      ${metaInfo ? row("Meta Ads", metaInfo) : ""}
      ${meetRow}
    </div>
    ${qualificationBlock}
    ${formAnswersBlock}
    ${leadFull?.ai_summary ? `<div style="background:#ecfeff;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #06b6d4">
      <p style="font-size:12px;color:#0e7490;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px">Résumé IA</p>
      <p style="font-size:13px;color:#111827;margin:0;white-space:pre-wrap">${escapeHtml(leadFull.ai_summary)}</p>
    </div>` : ""}
    ${leadFull?.sales_angle ? `<div style="background:#f0fdf4;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #22c55e">
      <p style="font-size:12px;color:#15803d;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px">Angle de vente</p>
      <p style="font-size:13px;color:#111827;margin:0;white-space:pre-wrap">${escapeHtml(leadFull.sales_angle)}</p>
    </div>` : ""}
    ${leadFull?.notes ? `<div style="background:#fef2f2;border-radius:8px;padding:14px 18px;margin:14px 0;border-left:3px solid #ef4444">
      <p style="font-size:12px;color:#b91c1c;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px">Notes</p>
      <p style="font-size:13px;color:#111827;margin:0;white-space:pre-wrap">${escapeHtml(leadFull.notes)}</p>
    </div>` : ""}
    ${activitiesBlock}
    <div style="margin:25px 0">
      <a href="${bookingUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">
        Ouvrir la fiche lead
      </a>
    </div>
  </div>
</body></html>`;
      const adminNotifyMsgId = `booking-admin-notify-${bookingId}`;
      try {
        await supabase.functions.invoke("send-smtp-email", {
          body: {
            to: recipients,
            subject: `📅 ${wsPrefix}Nouveau RDV — ${name} (${booking_date} ${time_slot})`,
            html,
            replyTo: email,
            workspaceId: offer_workspace_id,
          },
        });
        await supabase.from("email_send_log").insert({
          template_name: "booking-admin-notify",
          recipient_email: recipients.join(","),
          status: "sent",
          message_id: adminNotifyMsgId,
          metadata: { booking_id: bookingId, lead_id: leadId, recipients, automated: true, subject: `📅 ${wsPrefix}Nouveau RDV — ${name} (${booking_date} ${time_slot})`, body_html: html },
        });
      } catch (e) {
        console.error("Notification email failed:", e);
        await supabase.from("email_send_log").insert({
          template_name: "booking-admin-notify",
          recipient_email: recipients.join(","),
          status: "failed",
          message_id: adminNotifyMsgId,
          error_message: e instanceof Error ? e.message : String(e),
          metadata: { booking_id: bookingId, lead_id: leadId, recipients, automated: true },
        });
      }
    } catch (e) {
      console.error("Notification email failed:", e);
    }


    return new Response(
      JSON.stringify({
        success: true,
        booking_id: bookingId,
        lead_id: leadId,
        meet_link: meetLink,
        google_synced: !!googleEventId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Handle booking error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
