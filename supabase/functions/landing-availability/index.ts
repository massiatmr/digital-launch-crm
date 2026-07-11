// Public availability endpoint for external landing pages.
// Auth: x-api-key (workspace_api_keys). Returns free slots per date for an offer.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getWorkspaceFreeBusy } from "../_shared/calendar/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateHourlySlots(startTime: string, endTime: string, durationMin: number, stepMin: number = 60): string[] {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const out: string[] = [];
  const step = stepMin > 0 ? stepMin : 60;
  for (let t = startMin; t + durationMin <= endMin; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

function addDays(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function tzParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return {
    year: +map.year, month: +map.month, day: +map.day,
    hour: +map.hour, minute: +map.minute, second: +map.second,
  };
}
function tzOffsetMs(tz: string, date: Date) {
  const p = tzParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}
function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const base = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = base;
  for (let i = 0; i < 2; i++) ts = base - tzOffsetMs(tz, new Date(ts));
  return new Date(ts);
}
function fmtDateTz(date: Date, tz: string): string {
  const p = tzParts(date, tz);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function fmtTimeTz(date: Date, tz: string): string {
  const p = tzParts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = req.headers.get("x-api-key") || "";
    if (!apiKey || apiKey.length < 20) {
      return new Response(JSON.stringify({ error: "missing_api_key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let offerSlug = "";
    let days = 14;
    if (req.method === "GET") {
      const url = new URL(req.url);
      offerSlug = (url.searchParams.get("offer_slug") || "").trim();
      const d = parseInt(url.searchParams.get("days") || "14", 10);
      if (!isNaN(d)) days = Math.max(1, Math.min(60, d));
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      offerSlug = String(body.offer_slug || "").trim();
      if (body.days) days = Math.max(1, Math.min(60, +body.days || 14));
    } else {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow } = await supabase
      .from("workspace_api_keys")
      .select("id, workspace_id, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (!keyRow || keyRow.revoked_at) {
      return new Response(JSON.stringify({ error: "invalid_api_key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve offer: by slug or first active offer of workspace
    let offerQuery = supabase
      .from("offers")
      .select("id, slug, name, owner_id, workspace_id")
      .eq("workspace_id", keyRow.workspace_id)
      .eq("is_active", true)
      .is("deleted_at", null);
    if (offerSlug) offerQuery = offerQuery.eq("slug", offerSlug);
    const { data: offer } = await offerQuery.limit(1).maybeSingle();

    if (!offer) {
      return new Response(JSON.stringify({ error: "offer_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: avail } = await supabase
      .from("availability_settings")
      .select("working_days, day_start_time, day_end_time, slot_duration_minutes, max_future_days, min_lead_time_hours, timezone, day_hours")
      .eq("workspace_id", keyRow.workspace_id)
      .maybeSingle();

    const tz: string = avail?.timezone ?? "Europe/Paris";
    const workingDays: number[] = avail?.working_days ?? [1, 2, 3, 4, 5];
    const defStart: string = avail?.day_start_time ?? "11:00";
    const defEnd: string = avail?.day_end_time ?? "15:00";
    const dayHours: Record<string, { start?: string; end?: string }> = (avail?.day_hours as any) ?? {};
    const slotMin: number = avail?.slot_duration_minutes ?? 45;
    const maxDays: number = avail?.max_future_days ?? 14;
    const minLeadH: number = avail?.min_lead_time_hours ?? 2;
    const meetingMs = slotMin * 60 * 1000;
    const minStartMs = Date.now() + minLeadH * 3600 * 1000;

    const todayStr = fmtDateTz(new Date(), tz);
    const range = Math.min(days, maxDays);

    // Blackouts
    const rangeEnd = addDays(todayStr, range);
    const { data: blackouts } = await supabase
      .from("availability_blackouts")
      .select("blackout_date")
      .eq("workspace_id", keyRow.workspace_id)
      .gte("blackout_date", todayStr)
      .lte("blackout_date", rangeEnd);
    const blackoutSet = new Set((blackouts || []).map((b: any) => b.blackout_date));

    // FreeBusy over full range once
    const timeMin = zonedToUtc(todayStr, "00:00", tz).toISOString();
    const timeMax = new Date(zonedToUtc(rangeEnd, "23:59", tz).getTime() + 59_000).toISOString();
    let busy: Array<{ start: string; end: string }> = [];
    let synced = false;
    try {
      busy = await getWorkspaceFreeBusy(keyRow.workspace_id, { timeMin, timeMax });
      synced = true;
    } catch (e) {
      console.error("freebusy failed", e);
    }

    // Existing bookings in workspace (block conflicts even without gcal)
    const { data: existing } = await supabase
      .from("bookings")
      .select("booking_date, time_slot, status")
      .eq("workspace_id", keyRow.workspace_id)
      .gte("booking_date", todayStr)
      .lte("booking_date", rangeEnd)
      .in("status", ["pending", "confirmed"]);
    const takenByDate = new Map<string, Set<string>>();
    for (const b of existing || []) {
      if (!takenByDate.has(b.booking_date)) takenByDate.set(b.booking_date, new Set());
      takenByDate.get(b.booking_date)!.add(b.time_slot);
    }

    const daysOut: Array<{ date: string; slots: string[] }> = [];
    for (let i = 0; i <= range; i++) {
      const date = addDays(todayStr, i);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (!workingDays.includes(dow)) { daysOut.push({ date, slots: [] }); continue; }
      if (blackoutSet.has(date)) { daysOut.push({ date, slots: [] }); continue; }

      const dayOverride = dayHours?.[String(dow)] ?? {};
      const dStart = (dayOverride.start && /^\d{2}:\d{2}$/.test(dayOverride.start)) ? dayOverride.start : defStart;
      const dEnd = (dayOverride.end && /^\d{2}:\d{2}$/.test(dayOverride.end)) ? dayOverride.end : defEnd;

      const candidates = generateHourlySlots(dStart, dEnd, slotMin)
        .filter((slot) => zonedToUtc(date, slot, tz).getTime() >= minStartMs);

      const takenSet = takenByDate.get(date) ?? new Set<string>();

      const available = candidates.flatMap((slot) => {
        if (takenSet.has(slot)) return [];
        const s = zonedToUtc(date, slot, tz);
        const e = new Date(s.getTime() + meetingMs);
        for (const b of busy) {
          const bs = new Date(b.start); const be = new Date(b.end);
          if (s < be && e > bs) return [];
        }
        if (fmtDateTz(s, tz) !== date) return [];
        return [fmtTimeTz(s, tz)];
      });

      daysOut.push({ date, slots: [...new Set(available)].sort() });
    }

    return new Response(JSON.stringify({
      ok: true,
      offer: { id: offer.id, slug: offer.slug, name: offer.name },
      owner_timezone: tz,
      slot_duration_minutes: slotMin,
      max_future_days: maxDays,
      synced,
      days: daysOut,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("landing-availability error", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
