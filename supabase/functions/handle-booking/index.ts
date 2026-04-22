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
    const { name, email, phone, booking_date, time_slot, offer_id, notes } = await req.json();

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
    const bookingDateTime = new Date(`${booking_date}T${time_slot}:00`);

    const emailSchedules: Array<{
      type: "confirmation" | "24h_before" | "12h_before" | "1h_before";
      scheduled_at: string;
    }> = [
      { type: "confirmation", scheduled_at: new Date().toISOString() },
      { type: "24h_before", scheduled_at: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString() },
      { type: "12h_before", scheduled_at: new Date(bookingDateTime.getTime() - 12 * 60 * 60 * 1000).toISOString() },
      { type: "1h_before", scheduled_at: new Date(bookingDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString() },
    ];

    const emailInserts = emailSchedules.map((es) => ({
      booking_id: bookingId,
      type: es.type,
      scheduled_at: es.scheduled_at,
      status: "pending",
    }));

    const { error: emailError } = await supabase.from("booking_emails").insert(emailInserts);
    if (emailError) console.error("Email schedule error:", emailError);

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

    // 7. Notify the owner (push + email via SMTP)
    const APP_BASE_URL = "https://digital-launch-crm.lovable.app";
    const ADMIN_NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
    const bookingUrl = `${APP_BASE_URL}/bookings`;
    const titleSuffix = offerName ? ` — ${offerName}` : "";
    const meetRow = meetLink
      ? `<p style="font-size:12px;color:#7c3aed;font-weight:600;margin:8px 0 2px;text-transform:uppercase;letter-spacing:0.5px">🔗 Google Meet</p>
         <p style="font-size:14px;color:#1a1a2e;margin:0 0 8px"><a href="${meetLink}" style="color:#7c3aed">${meetLink}</a></p>`
      : "";

    // Résoudre workspace pour préfixer + envoyer aussi à l'email du workspace
    let workspaceName: string | null = null;
    let workspaceEmail: string | null = null;
    {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", leadId)
        .maybeSingle();
      if (leadRow?.workspace_id) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("company_name, notification_email, email")
          .eq("id", leadRow.workspace_id)
          .maybeSingle();
        workspaceName = ws?.company_name || null;
        workspaceEmail = (ws?.notification_email || ws?.email || "").trim() || null;
      }
    }
    const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
    const recipients = Array.from(new Set(
      [ADMIN_NOTIFY_EMAIL, workspaceEmail].filter((e): e is string => !!e)
    ));

    // Push to owner via OneSignal
    try {
      await supabase.functions.invoke("send-onesignal-notification", {
        body: {
          user_id: owner_id,
          title: `📅 ${wsPrefix}Nouveau RDV — ${name}`,
          body: `${booking_date} à ${time_slot} • ${offerName}`,
          url: `/bookings`,
          tag: `new-booking-${bookingId}`.slice(0, 32),
        },
      });
    } catch (e) {
      console.error("Owner push failed:", e);
    }

    // Email to admin + workspace via SMTP
    try {
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:0 auto;padding:30px 25px">
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 6px">📅 Nouveau RDV${titleSuffix}</h1>
    ${workspaceName ? `<div style="font-size:13px;color:#6b7280;margin:0 0 16px">Espace : ${workspaceName}</div>` : ""}
    <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">
      Un prospect vient de prendre rendez-vous via une de tes pages.
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:18px 22px;margin:18px 0;border-left:3px solid #d1d5db">
      <p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">Nom</p>
      <p style="font-size:15px;color:#111827;font-weight:600;margin:0 0 8px">${name}</p>
      <p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">Email</p>
      <p style="font-size:15px;color:#111827;margin:0 0 8px">${email}</p>
      <p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">Téléphone</p>
      <p style="font-size:15px;color:#111827;margin:0 0 8px">${phone}</p>
      <p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">Créneau</p>
      <p style="font-size:15px;color:#111827;margin:0 0 8px">${booking_date} à ${time_slot}</p>
      <p style="font-size:12px;color:#6b7280;font-weight:500;margin:8px 0 2px">Offre</p>
      <p style="font-size:15px;color:#111827;margin:0 0 8px">${offerName}</p>
      ${meetRow}
    </div>
    <div style="margin:25px 0">
      <a href="${bookingUrl}" style="background:#111827;color:#fff;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;text-decoration:none;display:inline-block">
        Voir dans le CRM
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
      console.error("Owner email failed:", e);
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
