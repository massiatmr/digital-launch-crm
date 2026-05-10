import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function addDays(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  let utcTs = baseUtc;
  for (let i = 0; i < 2; i++) {
    utcTs = baseUtc - getTimeZoneOffsetMs(timeZone, new Date(utcTs));
  }

  return new Date(utcTs);
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

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

  const expiresAt = new Date(tokens.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokens.access_token;
  }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offer_id, date } = await req.json();

    if (!offer_id || !date) {
      return new Response(
        JSON.stringify({ error: "offer_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "Invalid date format, expected YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: offer } = await supabase
      .from("offers")
      .select("owner_id")
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

    const { data: avail } = await supabase
      .from("availability_settings")
      .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
      .eq("owner_id", owner_id)
      .maybeSingle();

    const ownerTimeZone: string = avail?.timezone ?? "Europe/Paris";
    const workingDays: number[] = avail?.working_days ?? [1, 2, 3, 4, 5];
    const dayStart: string = avail?.day_start_time ?? "11:00";
    const dayEnd: string = avail?.day_end_time ?? "15:00";
    const slotDurationMin: number = avail?.slot_duration_minutes ?? 45;
    const maxFutureDays: number = avail?.max_future_days ?? 14;
    const minLeadHours: number = avail?.min_lead_time_hours ?? 2;
    const meetingDurationMs = slotDurationMin * 60 * 1000;
    const minLeadMs = minLeadHours * 60 * 60 * 1000;
    const nowMs = Date.now();

    const todayStr = formatDateInTimeZone(new Date(), ownerTimeZone);
    const maxDate = addDays(todayStr, maxFutureDays);
    if (date > maxDate) {
      return new Response(
        JSON.stringify({ slots: [], synced: true, reason: "out_of_range" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!workingDays.includes(dow)) {
      return new Response(
        JSON.stringify({ slots: [], synced: true, reason: "non_working_day" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: blackout } = await supabase
      .from("availability_blackouts")
      .select("id")
      .eq("owner_id", owner_id)
      .eq("blackout_date", date)
      .maybeSingle();
    if (blackout) {
      return new Response(
        JSON.stringify({ slots: [], synced: true, reason: "blackout" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const minStartMs = nowMs + minLeadMs;
    const ownerSlots = generateHourlySlots(dayStart, dayEnd, slotDurationMin).filter((slot) => {
      return zonedDateTimeToUtc(date, slot, ownerTimeZone).getTime() >= minStartMs;
    });
    const accessToken = await getValidAccessToken(supabase, owner_id);

    if (!accessToken) {
      const displaySlots = ownerSlots
        .map((slot) => formatTimeInTimeZone(zonedDateTimeToUtc(date, slot, ownerTimeZone), "Europe/Paris"))
        .filter((slotDate, index, arr) => arr.indexOf(slotDate) === index)
        .sort();

      return new Response(
        JSON.stringify({ slots: displaySlots, synced: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timeMin = zonedDateTimeToUtc(date, "00:00", ownerTimeZone).toISOString();
    const timeMax = new Date(zonedDateTimeToUtc(date, "23:59", ownerTimeZone).getTime() + 59 * 1000).toISOString();

    const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: ownerTimeZone,
        items: [{ id: "primary" }],
      }),
    });

    if (!freeBusyRes.ok) {
      console.error("FreeBusy API error:", await freeBusyRes.text());
      const displaySlots = ownerSlots
        .map((slot) => formatTimeInTimeZone(zonedDateTimeToUtc(date, slot, ownerTimeZone), "Europe/Paris"))
        .filter((slotDate, index, arr) => arr.indexOf(slotDate) === index)
        .sort();

      return new Response(
        JSON.stringify({ slots: displaySlots, synced: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const freeBusyData = await freeBusyRes.json();
    const busyPeriods: Array<{ start: string; end: string }> = freeBusyData.calendars?.primary?.busy || [];

    const availableSlots = ownerSlots.flatMap((slot) => {
      const slotStart = zonedDateTimeToUtc(date, slot, ownerTimeZone);
      const slotEnd = new Date(slotStart.getTime() + meetingDurationMs);

      for (const busy of busyPeriods) {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        if (slotStart < busyEnd && slotEnd > busyStart) return [];
      }

      if (formatDateInTimeZone(slotStart, "Europe/Paris") !== date) return [];
      return [formatTimeInTimeZone(slotStart, "Europe/Paris")];
    });

    return new Response(
      JSON.stringify({ slots: [...new Set(availableSlots)].sort(), synced: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-availability error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
