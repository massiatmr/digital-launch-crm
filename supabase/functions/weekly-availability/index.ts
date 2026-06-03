import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWorkspaceFreeBusy } from "../_shared/calendar/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { date_from, workspace_id } = await req.json();
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
    let workspaceId: string | null = typeof workspace_id === "string" ? workspace_id : null;
    if (workspaceId) {
      const { data: member } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) workspaceId = null;
    }

    let avail: any = null;
    if (workspaceId) {
      const { data } = await admin.from("availability_settings")
        .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
        .eq("workspace_id", workspaceId).maybeSingle();
      avail = data;
    } else {
      const { data } = await admin.from("availability_settings")
        .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone")
        .eq("owner_id", ownerId).is("workspace_id", null).maybeSingle();
      avail = data;
    }
    const ownerTimeZone: string = avail?.timezone ?? "Europe/Paris";
    const workingDays: number[] = avail?.working_days ?? [1, 2, 3, 4, 5];
    const dayStart: string = avail?.day_start_time ?? "11:00";
    const dayEnd: string = avail?.day_end_time ?? "15:00";
    const slotDurationMin: number = avail?.slot_duration_minutes ?? 45;
    const maxFutureDays: number = avail?.max_future_days ?? 14;
    const minLeadHours: number = avail?.min_lead_time_hours ?? 2;
    const slotDurationMs = slotDurationMin * 60 * 1000;
    const minLeadMs = minLeadHours * 60 * 60 * 1000;
    const baseSlots = generateHourlySlots(dayStart, dayEnd, slotDurationMin);

    const dateTo = addDays(date_from, 6);
    const today = formatDateInTimeZone(new Date(), ownerTimeZone);
    const maxDate = addDays(today, maxFutureDays);

    let blackoutsQuery = admin.from("availability_blackouts")
      .select("blackout_date")
      .gte("blackout_date", date_from).lte("blackout_date", dateTo);
    blackoutsQuery = workspaceId ? blackoutsQuery.eq("workspace_id", workspaceId) : blackoutsQuery.eq("owner_id", ownerId);
    const { data: blackoutsRows } = await blackoutsQuery;
    const blackouts = new Set((blackoutsRows ?? []).map((r: any) => r.blackout_date));

    let bookingsQuery = admin.from("bookings")
      .select("booking_date, time_slot, status")
      .gte("booking_date", date_from).lte("booking_date", dateTo)
      .neq("status", "cancelled");
    bookingsQuery = workspaceId ? bookingsQuery.eq("workspace_id", workspaceId) : bookingsQuery.eq("owner_id", ownerId);
    const { data: bookingsRows } = await bookingsQuery;
    const bookedKey = new Set(
      (bookingsRows ?? []).map((r: any) => {
        const ownerBookingStart = zonedDateTimeToUtc(r.booking_date, r.time_slot, "Europe/Paris");
        return `${formatDateInTimeZone(ownerBookingStart, ownerTimeZone)}_${formatTimeInTimeZone(ownerBookingStart, ownerTimeZone)}`;
      })
    );

    let busyByDay: Record<string, Array<{ start: Date; end: Date }>> = {};
    let synced = false;
    if (workspaceId) {
      const timeMin = zonedDateTimeToUtc(date_from, "00:00", ownerTimeZone).toISOString();
      const timeMax = new Date(zonedDateTimeToUtc(dateTo, "23:59", ownerTimeZone).getTime() + 59 * 1000).toISOString();
      try {
        const busy = await getWorkspaceFreeBusy(workspaceId, { timeMin, timeMax });
        for (const b of busy) {
          const s = new Date(b.start); const e = new Date(b.end);
          const dayKey = formatDateInTimeZone(s, ownerTimeZone);
          if (!busyByDay[dayKey]) busyByDay[dayKey] = [];
          busyByDay[dayKey].push({ start: s, end: e });
        }
        synced = true;
      } catch (err) {
        console.error("Workspace calendar freebusy failed:", err);
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

      const slots = baseSlots.map((time) => {
        const ownerSlotStart = zonedDateTimeToUtc(d, time, ownerTimeZone);
        const ownerSlotEnd = new Date(ownerSlotStart.getTime() + slotDurationMs);
        let status: "past" | "non_working" | "blackout" | "booked" | "busy" | "free" | "out_of_range" = "free";
        if (ownerSlotStart.getTime() < now) status = "past";
        else if (ownerSlotStart.getTime() < now + minLeadMs) status = "past";
        else if (!working) status = "non_working";
        else if (blackout) status = "blackout";
        else if (beyondMax) status = "out_of_range";
        else if (bookedKey.has(`${d}_${time}`)) status = "booked";
        else {
          const busy = busyByDay[d] ?? [];
          for (const b of busy) {
            if (ownerSlotStart < b.end && ownerSlotEnd > b.start) { status = "busy"; break; }
          }
        }
        return { time: formatTimeInTimeZone(ownerSlotStart, ownerTimeZone), status };
      }).filter((slot, index, arr) => arr.findIndex((item) => item.time === slot.time) === index);

      days.push({
        date: d,
        dow,
        working,
        blackout,
        beyond_max: beyondMax,
        is_past: zonedDateTimeToUtc(d, dayEnd, ownerTimeZone).getTime() < now,
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
