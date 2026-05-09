import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshGoogleToken(refreshToken: string) {
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
  if (!res.ok) return null;
  return await res.json();
}

async function getValidAccessToken(supabase: any, ownerId: string): Promise<string | null> {
  const { data: tokens } = await supabase
    .from("google_tokens").select("*").eq("user_id", ownerId).maybeSingle();
  if (!tokens) return null;
  const expiresAt = new Date(tokens.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return tokens.access_token;
  const refreshed = await refreshGoogleToken(tokens.refresh_token);
  if (!refreshed) return null;
  await supabase.from("google_tokens").update({
    access_token: refreshed.access_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", ownerId);
  return refreshed.access_token;
}

function parisOffsetFor(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const parisHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(probe)
  );
  let diff = parisHour - probe.getUTCHours();
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return `${diff >= 0 ? "+" : "-"}${String(Math.abs(diff)).padStart(2, "0")}:00`;
}

function addDays(d: string, n: number): string {
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function generateHourlySlots(startTime: string, endTime: string, durationMin: number): string[] {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const out: string[] = [];
  for (let t = startMin; t + durationMin <= endMin; t += 60) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { date_from } = await req.json();
    if (!date_from || !/^\d{4}-\d{2}-\d{2}$/.test(date_from)) {
      return new Response(JSON.stringify({ error: "date_from required (YYYY-MM-DD)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const ownerId = user.id;

    const { data: avail } = await admin.from("availability_settings")
      .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days")
      .eq("owner_id", ownerId).maybeSingle();
    const workingDays: number[] = avail?.working_days ?? [1, 2, 3, 4, 5];
    const dayStart: string = avail?.day_start_time ?? "11:00";
    const dayEnd: string = avail?.day_end_time ?? "15:00";
    const slotDurationMin: number = avail?.slot_duration_minutes ?? 45;
    const maxFutureDays: number = avail?.max_future_days ?? 14;
    const slotDurationMs = slotDurationMin * 60 * 1000;
    const baseSlots = generateHourlySlots(dayStart, dayEnd, slotDurationMin);

    const dateTo = addDays(date_from, 6);

    // Limite des dates dans le futur autorisées (à partir d'aujourd'hui)
    const today = new Date().toISOString().slice(0, 10);
    const maxDate = addDays(today, maxFutureDays);

    const { data: blackoutsRows } = await admin.from("availability_blackouts")
      .select("blackout_date").eq("owner_id", ownerId)
      .gte("blackout_date", date_from).lte("blackout_date", dateTo);
    const blackouts = new Set((blackoutsRows ?? []).map((r: any) => r.blackout_date));

    const { data: bookingsRows } = await admin.from("bookings")
      .select("booking_date, time_slot, status")
      .eq("owner_id", ownerId)
      .gte("booking_date", date_from).lte("booking_date", dateTo)
      .neq("status", "cancelled");
    const bookedKey = new Set(
      (bookingsRows ?? []).map((r: any) => `${r.booking_date}_${r.time_slot}`)
    );

    // Google freeBusy pour la semaine
    const accessToken = await getValidAccessToken(admin, ownerId);
    let busyByDay: Record<string, Array<{ start: Date; end: Date }>> = {};
    let synced = false;
    if (accessToken) {
      const offsetStart = parisOffsetFor(date_from);
      const offsetEnd = parisOffsetFor(dateTo);
      const timeMin = `${date_from}T00:00:00${offsetStart}`;
      const timeMax = `${dateTo}T23:59:59${offsetEnd}`;
      const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin, timeMax, timeZone: "Europe/Paris", items: [{ id: "primary" }] }),
      });
      if (fbRes.ok) {
        const data = await fbRes.json();
        const busy: Array<{ start: string; end: string }> = data.calendars?.primary?.busy ?? [];
        for (const b of busy) {
          const s = new Date(b.start); const e = new Date(b.end);
          const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(s);
          if (!busyByDay[dayKey]) busyByDay[dayKey] = [];
          busyByDay[dayKey].push({ start: s, end: e });
        }
        synced = true;
      }
    }

    const now = Date.now();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(date_from, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      const working = workingDays.includes(dow);
      const blackout = blackouts.has(d);
      const beyondMax = d > maxDate;
      const offset = parisOffsetFor(d);

      const slots = baseSlots.map((time) => {
        const slotStart = new Date(`${d}T${time}:00${offset}`);
        const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
        let status: "past" | "non_working" | "blackout" | "booked" | "busy" | "free" | "out_of_range" = "free";
        if (slotStart.getTime() < now) status = "past";
        else if (!working) status = "non_working";
        else if (blackout) status = "blackout";
        else if (beyondMax) status = "out_of_range";
        else if (bookedKey.has(`${d}_${time}`)) status = "booked";
        else {
          const busy = busyByDay[d] ?? [];
          for (const b of busy) {
            if (slotStart < b.end && slotEnd > b.start) { status = "busy"; break; }
          }
        }
        return { time, status };
      });

      days.push({
        date: d,
        dow,
        working,
        blackout,
        beyond_max: beyondMax,
        is_past: new Date(`${d}T23:59:59${offset}`).getTime() < now,
        slots,
      });
    }

    return new Response(JSON.stringify({
      days,
      synced,
      day_start_time: dayStart,
      day_end_time: dayEnd,
      slot_duration_minutes: slotDurationMin,
      max_future_days: maxFutureDays,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-availability error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
