import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get("Google_Client_id")!;
  const clientSecret = Deno.env.get("Client_secret")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }

  return await res.json();
}

async function getValidAccessToken(supabase: any, ownerId: string): Promise<string | null> {
  const { data: tokens } = await supabase
    .from("google_tokens")
    .select("*")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!tokens) return null;

  // Check if token is expired (with 5min buffer)
  const expiresAt = new Date(tokens.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokens.access_token;
  }

  // Refresh the token
  const refreshed = await refreshGoogleToken(tokens.refresh_token);
  if (!refreshed) return null;

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("google_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", ownerId);

  return refreshed.access_token;
}

// Add `hours` to a "HH:MM" time string, returning "HH:MM" (24h, wraps within same day expected for our 11-15h window).
function addHoursToTimeSlot(timeSlot: string, hours: number): string {
  const [h, m] = timeSlot.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

async function createGoogleCalendarEvent(
  accessToken: string,
  name: string,
  email: string,
  bookingDate: string,
  timeSlot: string,
  offerName: string
): Promise<{ eventId: string; meetLink: string | null } | null> {
  // IMPORTANT: Send the local Paris wall-clock time WITHOUT a Z suffix.
  // When `timeZone: "Europe/Paris"` is provided, Google interprets the
  // dateTime as local time in that zone (handling DST automatically).
  // Using `.toISOString()` would force UTC and shift the event by 1-2h.
  const endTimeSlot = addHoursToTimeSlot(timeSlot, 1);
  const startLocal = `${bookingDate}T${timeSlot}:00`;
  const endLocal = `${bookingDate}T${endTimeSlot}:00`;

  const event = {
    summary: `RDV - ${name} (${offerName})`,
    description: `Rendez-vous avec ${name} (${email}) pour l'offre "${offerName}"`,
    start: {
      dateTime: startLocal,
      timeZone: "Europe/Paris",
    },
    end: {
      dateTime: endLocal,
      timeZone: "Europe/Paris",
    },
    attendees: [{ email }],
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 240 },
      ],
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    console.error("Calendar event creation failed:", await res.text());
    return null;
  }

  const data = await res.json();
  return {
    eventId: data.id,
    meetLink: data.conferenceData?.entryPoints?.[0]?.uri || null,
  };
}

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
      .select("name, owner_id")
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
    const offerName = offer.name || "Consultation";

    // Try to create Google Calendar event
    let googleEventId: string | null = null;
    let meetLink: string | null = null;

    const accessToken = await getValidAccessToken(supabase, owner_id);
    if (accessToken) {
      const calendarResult = await createGoogleCalendarEvent(
        accessToken, name, email, booking_date, time_slot, offerName
      );
      if (calendarResult) {
        googleEventId = calendarResult.eventId;
        meetLink = calendarResult.meetLink;
        console.log("Google Calendar event created:", googleEventId, "Meet:", meetLink);
      }
    } else {
      console.log("No Google tokens found for owner, skipping calendar sync");
    }

    // 1. Create the booking
    const bookingId = crypto.randomUUID();
    const { error: bookingError } = await supabase.from("bookings").insert({
      id: bookingId,
      owner_id,
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
    });

    if (bookingError) {
      console.error("Booking insert error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Failed to create booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if a lead already exists with this email for this owner
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", owner_id)
      .eq("email", email)
      .maybeSingle();

    let leadId: string;

    if (existingLead) {
      leadId = existingLead.id;
      await supabase
        .from("leads")
        .update({ offer_id, status: "qualified", last_contacted_at: new Date().toISOString() })
        .eq("id", leadId);
    } else {
      leadId = crypto.randomUUID();
      await supabase.from("leads").insert({
        id: leadId,
        owner_id,
        name,
        email,
        phone: phone || "",
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
      type: "confirmation" | "24h_before" | "12h_before" | "1h_before";
      scheduled_at: string;
    }> = [
      { type: "confirmation", scheduled_at: new Date().toISOString() },
      { type: "24h_before", scheduled_at: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString() },
      { type: "12h_before", scheduled_at: new Date(bookingDateTime.getTime() - 12 * 60 * 60 * 1000).toISOString() },
      { type: "1h_before", scheduled_at: new Date(bookingDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString() },
    ];

    // Charge les overrides de template par offre pour respecter les toggles enabled
    const { data: tplRows } = await supabase
      .from("offer_booking_email_templates")
      .select("type, enabled")
      .eq("offer_id", offer_id);
    const disabledTypes = new Set((tplRows || []).filter((r: any) => r.enabled === false).map((r: any) => r.type));

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

    // 6. Send booking confirmation email to the prospect
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "booking-confirmation",
          recipientEmail: email,
          idempotencyKey: `booking-confirm-${bookingId}`,
          templateData: {
            name,
            bookingDate: booking_date,
            timeSlot: time_slot,
            offerName,
            meetLink: meetLink || undefined,
          },
        },
      });
      console.log("Booking confirmation email sent to:", email);
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
    const memberEmails: string[] = [];
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
        try {
          const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
          if (u?.user?.email) memberEmails.push(u.user.email);
        } catch (e) {
          console.error("getUserById failed for", m.user_id, e);
        }
      }
    }

    const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
    const recipients = Array.from(new Set(
      [ADMIN_NOTIFY_EMAIL, workspaceEmail, ...memberEmails].filter((e): e is string => !!e)
    ));

    // Push to all workspace members via OneSignal
    const pushTargets = Array.from(new Set([owner_id, ...((leadFull?.workspace_id ? (await supabase.from("workspace_members").select("user_id").eq("workspace_id", leadFull.workspace_id)).data?.map(m => m.user_id) : []) || [])]));
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
      await supabase.functions.invoke("send-smtp-email", {
        body: {
          to: recipients,
          subject: `📅 ${wsPrefix}Nouveau RDV — ${name} (${booking_date} ${time_slot})`,
          html,
          replyTo: email,
        },
      });
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
