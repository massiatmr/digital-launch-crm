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

// Compute UTC Date for a local (booking_date + time_slot) in a given IANA tz.
function localToUtc(dateStr: string, timeSlot: string, timeZone: string): Date {
  const [hh, mm] = timeSlot.split(":").map(Number);
  const probe = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  const tzHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(probe),
  );
  const utcHour = probe.getUTCHours();
  let diff = tzHour - utcHour;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return new Date(`${dateStr}T${String(hh - diff).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
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

    // Availability settings (timezone/duration) — used for both GCal sync and reminder reschedule.
    let calendarTimeZone = "Europe/Paris";
    let durationMinutes = 60;
    if (booking.workspace_id) {
      const { data: availability } = await supabase
        .from("availability_settings")
        .select("timezone, slot_duration_minutes")
        .eq("workspace_id", booking.workspace_id)
        .maybeSingle();
      calendarTimeZone = availability?.timezone || "Europe/Paris";
      durationMinutes = availability?.slot_duration_minutes || 60;
    }

    // === 1. Reminders sync (booking_emails + booking_wa_reminders) ===
    // Only affect rows still pending — never touch already-sent messages.
    if (action === "cancel") {
      const nowIso = new Date().toISOString();
      await supabase
        .from("booking_emails")
        .update({ status: "skipped", sent_at: nowIso } as any)
        .eq("booking_id", booking.id)
        .eq("status", "pending");
      await supabase
        .from("booking_wa_reminders")
        .update({ status: "skipped", error_message: "booking cancelled", sent_at: nowIso } as any)
        .eq("booking_id", booking.id)
        .eq("status", "pending");
      // Cancel local reminders too (owner nudges)
      await supabase
        .from("reminders")
        .update({ done: true } as any)
        .eq("lead_id", (booking as any).lead_id ?? "00000000-0000-0000-0000-000000000000")
        .eq("done", false);
    } else if (action === "update") {
      const bookingDateTime = localToUtc(booking.booking_date, booking.time_slot, calendarTimeZone);
      const offsetsMs: Record<string, number | null> = {
        confirmation: null, // do not reschedule confirmation email
        "24h_before": 24 * 60 * 60 * 1000,
        "12h_before": 12 * 60 * 60 * 1000,
        "1h_before": 1 * 60 * 60 * 1000,
      };
      // Fetch pending reminders and reschedule per type.
      const { data: pendingEmails } = await supabase
        .from("booking_emails")
        .select("id, type")
        .eq("booking_id", booking.id)
        .eq("status", "pending");
      for (const row of pendingEmails || []) {
        const off = offsetsMs[(row as any).type];
        if (off == null) continue;
        const newAt = new Date(bookingDateTime.getTime() - off).toISOString();
        await supabase.from("booking_emails").update({ scheduled_at: newAt } as any).eq("id", (row as any).id);
      }
      const { data: pendingWa } = await supabase
        .from("booking_wa_reminders")
        .select("id, type")
        .eq("booking_id", booking.id)
        .eq("status", "pending");
      for (const row of pendingWa || []) {
        const off = offsetsMs[(row as any).type];
        if (off == null) continue;
        const newAt = new Date(bookingDateTime.getTime() - off).toISOString();
        await supabase.from("booking_wa_reminders").update({ scheduled_at: newAt } as any).eq("id", (row as any).id);
      }
    }

    // === 2. Google Calendar sync ===
    if (!booking.google_event_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_event", action }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!booking.workspace_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_workspace_calendar", action }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const primary = await getPrimaryAccount(booking.workspace_id);
    if (!primary) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_primary_calendar", action }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adapter = adapterFor(primary.provider);

    if (action === "cancel") {
      await adapter.deleteEvent(primary, booking.google_event_id);
      await supabase.from("bookings").update({ google_event_id: null } as any).eq("id", booking.id);
      return new Response(JSON.stringify({ ok: true, action: "cancelled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
