import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { adapterFor, getPrimaryAccount } from "../_shared/calendar/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function addHoursToTimeSlot(timeSlot: string, hours: number): string {
  const [h, m] = timeSlot.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
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
      .select("id, owner_id, name, email, booking_date, time_slot, google_event_id, offer_id, offers(name)")
      .eq("id", booking_id)
      .maybeSingle();

    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.google_event_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_event" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidAccessToken(supabase, booking.owner_id);
    if (!accessToken) {
      return new Response(JSON.stringify({ ok: false, error: "No Google token" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`;

    if (action === "cancel") {
      const res = await fetch(eventUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const txt = await res.text();
        console.error("Calendar delete failed:", res.status, txt);
        return new Response(JSON.stringify({ ok: false, error: txt }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("bookings").update({ google_event_id: null } as any).eq("id", booking.id);
      return new Response(JSON.stringify({ ok: true, action: "cancelled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "update" → patch start/end with current booking values
    const endTimeSlot = addHoursToTimeSlot(booking.time_slot, 1);
    const startLocal = `${booking.booking_date}T${booking.time_slot}:00`;
    const endLocal = `${booking.booking_date}T${endTimeSlot}:00`;

    const patch = {
      start: { dateTime: startLocal, timeZone: "Europe/Paris" },
      end: { dateTime: endLocal, timeZone: "Europe/Paris" },
    };

    const res = await fetch(eventUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Calendar patch failed:", res.status, txt);
      return new Response(JSON.stringify({ ok: false, error: txt }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
