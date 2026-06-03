import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWorkspaceFreeBusy } from "../_shared/calendar/index.ts";

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
      .select("owner_id, workspace_id")
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
    const workspace_id = offer.workspace_id as string | null;

    // Prefer workspace-scoped settings; only fall back to owner-based when no workspace is set
    let avail: any = null;
    if (workspace_id) {
      const { data } = await supabase
        .from("availability_settings")
        .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
        .eq("workspace_id", workspace_id)
        .maybeSingle();
      avail = data;
    } else {
      const { data } = await supabase
        .from("availability_settings")
        .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
        .eq("owner_id", owner_id)
        .is("workspace_id", null)
        .maybeSingle();
      avail = data;
    }

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

    let blackoutQuery = supabase.from("availability_blackouts").select("id").eq("blackout_date", date);
    blackoutQuery = workspace_id
      ? blackoutQuery.eq("workspace_id", workspace_id)
      : blackoutQuery.eq("owner_id", owner_id);
    const { data: blackout } = await blackoutQuery.maybeSingle();
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
    const timeMin = zonedDateTimeToUtc(date, "00:00", ownerTimeZone).toISOString();
    const timeMax = new Date(zonedDateTimeToUtc(date, "23:59", ownerTimeZone).getTime() + 59 * 1000).toISOString();
    let busyPeriods: Array<{ start: string; end: string }> = [];
    let synced = false;

    if (workspace_id) {
      try {
        busyPeriods = await getWorkspaceFreeBusy(workspace_id, { timeMin, timeMax });
        synced = true;
      } catch (err) {
        console.error("Workspace calendar freebusy failed:", err);
      }
    }

    if (!workspace_id || !synced) {
      const displaySlots = ownerSlots
        .map((slot) => formatTimeInTimeZone(zonedDateTimeToUtc(date, slot, ownerTimeZone), ownerTimeZone))
        .filter((slotDate, index, arr) => arr.indexOf(slotDate) === index)
        .sort();

      return new Response(
        JSON.stringify({ slots: displaySlots, synced: false, owner_timezone: ownerTimeZone }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const availableSlots = ownerSlots.flatMap((slot) => {
      const slotStart = zonedDateTimeToUtc(date, slot, ownerTimeZone);
      const slotEnd = new Date(slotStart.getTime() + meetingDurationMs);

      for (const busy of busyPeriods) {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        if (slotStart < busyEnd && slotEnd > busyStart) return [];
      }

      if (formatDateInTimeZone(slotStart, ownerTimeZone) !== date) return [];
      return [formatTimeInTimeZone(slotStart, ownerTimeZone)];
    });

    return new Response(
      JSON.stringify({ slots: [...new Set(availableSlots)].sort(), synced: true, owner_timezone: ownerTimeZone }),
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
