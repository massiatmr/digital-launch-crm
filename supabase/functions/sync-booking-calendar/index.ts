import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { adapterFor, getPrimaryAccount } from "../_shared/calendar/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function addMinutesToTimeSlot(timeSlot: string, minutesToAdd: number): string {
  const [h, m] = timeSlot.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { booking_id, action } = await req.json();

    if (!booking_id || !["update", "cancel"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, owner_id, workspace_id, name, email, booking_date, time_slot, google_event_id, offer_id, offers(name)")
      .eq("id", booking_id)
      .maybeSingle();

    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let isAllowed = booking.owner_id === user.id;
    if (!isAllowed && booking.workspace_id) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", booking.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      isAllowed = !!member;
    }
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.google_event_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_event" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.workspace_id) {
      return new Response(JSON.stringify({ ok: false, error: "No workspace calendar" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const primary = await getPrimaryAccount(booking.workspace_id);
    if (!primary) {
      return new Response(JSON.stringify({ ok: false, error: "No primary calendar account" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adapter = adapterFor(primary.provider);
    const { data: availability } = await supabase
      .from("availability_settings")
      .select("timezone, slot_duration_minutes")
      .eq("workspace_id", booking.workspace_id)
      .maybeSingle();
    const calendarTimeZone = availability?.timezone || "Europe/Paris";
    const durationMinutes = availability?.slot_duration_minutes || 60;

    if (action === "cancel") {
      await adapter.deleteEvent(primary, booking.google_event_id);
      await supabase.from("bookings").update({ google_event_id: null } as any).eq("id", booking.id);
      return new Response(JSON.stringify({ ok: true, action: "cancelled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "update" → patch start/end with current booking values
    const endTimeSlot = addMinutesToTimeSlot(booking.time_slot, durationMinutes);
    const startLocal = `${booking.booking_date}T${booking.time_slot}:00`;
    const endLocal = `${booking.booking_date}T${endTimeSlot}:00`;

    await adapter.updateEvent(primary, booking.google_event_id, {
      startISO: startLocal,
      endISO: endLocal,
      timeZone: calendarTimeZone,
    });

    return new Response(JSON.stringify({ ok: true, action: "updated" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sync-booking-calendar error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
