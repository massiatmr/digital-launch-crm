import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      // Update the lead's offer_id if not set
      await supabase
        .from("leads")
        .update({ offer_id, last_contacted_at: new Date().toISOString() })
        .eq("id", leadId);
    } else {
      // Create a new lead
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
      {
        type: "confirmation",
        scheduled_at: new Date().toISOString(),
      },
      {
        type: "24h_before",
        scheduled_at: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        type: "12h_before",
        scheduled_at: new Date(bookingDateTime.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      },
      {
        type: "1h_before",
        scheduled_at: new Date(bookingDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const emailInserts = emailSchedules.map((es) => ({
      booking_id: bookingId,
      type: es.type,
      scheduled_at: es.scheduled_at,
      status: "pending",
    }));

    const { error: emailError } = await supabase
      .from("booking_emails")
      .insert(emailInserts);

    if (emailError) {
      console.error("Email schedule error:", emailError);
    }

    // 4. Create a reminder for the owner (4h before + 1h before)
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

    // 5. Add activity to lead
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      owner_id,
      activity_type: "meeting",
      description: `RDV réservé le ${booking_date} à ${time_slot}`,
    });

    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, lead_id: leadId }),
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
