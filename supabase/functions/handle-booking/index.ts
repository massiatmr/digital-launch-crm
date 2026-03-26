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

async function createGoogleCalendarEvent(
  accessToken: string,
  name: string,
  email: string,
  bookingDate: string,
  timeSlot: string,
  offerName: string
): Promise<{ eventId: string; meetLink: string | null } | null> {
  const startDateTime = `${bookingDate}T${timeSlot}:00`;
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  const event = {
    summary: `RDV - ${name} (${offerName})`,
    description: `Rendez-vous avec ${name} (${email}) pour l'offre "${offerName}"`,
    start: {
      dateTime: start.toISOString(),
      timeZone: "Europe/Paris",
    },
    end: {
      dateTime: end.toISOString(),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, booking_date, time_slot, offer_id, notes, owner_id } = await req.json();

    if (!name || !email || !booking_date || !time_slot || !offer_id || !owner_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get offer name for calendar event
    const { data: offer } = await supabase
      .from("offers")
      .select("name")
      .eq("id", offer_id)
      .maybeSingle();

    const offerName = offer?.name || "Consultation";

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
        .update({ offer_id, last_contacted_at: new Date().toISOString() })
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
        status: "new",
        offer_id,
        message: `Réservation RDV le ${booking_date} à ${time_slot}`,
      });
    }

    // Update booking with lead_id
    await supabase
      .from("bookings")
      .update({ lead_id: leadId })
      .eq("id", bookingId);

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
