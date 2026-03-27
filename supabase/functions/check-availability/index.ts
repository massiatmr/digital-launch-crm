import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default slots: 11:00 to 15:30, 1h meetings every 15min start
const DEFAULT_SLOTS = [
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30",
];

const MEETING_DURATION_MS = 60 * 60 * 1000; // 1 hour

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
    const { owner_id, date } = await req.json();

    if (!owner_id || !date) {
      return new Response(
        JSON.stringify({ error: "owner_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "Invalid date format, expected YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const accessToken = await getValidAccessToken(supabase, owner_id);

    if (!accessToken) {
      // Fallback: return all default slots
      console.log("No Google token, returning all default slots");
      return new Response(
        JSON.stringify({ slots: DEFAULT_SLOTS, synced: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query Google Calendar FreeBusy API
    const timeMin = `${date}T00:00:00+02:00`;
    const timeMax = `${date}T23:59:59+02:00`;

    const freeBusyRes = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: "Europe/Paris",
          items: [{ id: "primary" }],
        }),
      }
    );

    if (!freeBusyRes.ok) {
      console.error("FreeBusy API error:", await freeBusyRes.text());
      // Fallback
      return new Response(
        JSON.stringify({ slots: DEFAULT_SLOTS, synced: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const freeBusyData = await freeBusyRes.json();
    const busyPeriods: Array<{ start: string; end: string }> =
      freeBusyData.calendars?.primary?.busy || [];

    console.log(`Found ${busyPeriods.length} busy periods for ${date}`);

    // Filter available slots
    const availableSlots = DEFAULT_SLOTS.filter((slot) => {
      const slotStart = new Date(`${date}T${slot}:00`);
      // Adjust for Europe/Paris - the Date constructor uses local/UTC
      // We work with the raw times as Europe/Paris
      const slotEnd = new Date(slotStart.getTime() + MEETING_DURATION_MS);

      // Check if this slot overlaps with any busy period
      for (const busy of busyPeriods) {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);

        // Overlap if slotStart < busyEnd AND slotEnd > busyStart
        if (slotStart < busyEnd && slotEnd > busyStart) {
          return false;
        }
      }

      return true;
    });

    return new Response(
      JSON.stringify({ slots: availableSlots, synced: true }),
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
