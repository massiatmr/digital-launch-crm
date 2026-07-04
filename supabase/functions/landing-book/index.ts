// Public booking endpoint for external landing pages.
// Auth: x-api-key (workspace_api_keys). Creates a booking through handle-booking.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^0\d{9}$/.test(digits)) return "+33" + digits.slice(1);
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key") || "";
    if (!apiKey || apiKey.length < 20) {
      return new Response(JSON.stringify({ error: "missing_api_key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = String(body.name || "").trim().slice(0, 200);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
    const phone = normalizePhone(String(body.phone || "").trim().slice(0, 50));
    const booking_date = String(body.booking_date || "").trim();
    const time_slot = String(body.time_slot || "").trim();
    const notes = String(body.notes || "").trim().slice(0, 4000);
    const offer_slug = String(body.offer_slug || "").trim();
    const client_timezone = String(body.client_timezone || "").trim().slice(0, 80) || null;

    if (!name || !email || !phone) {
      return new Response(JSON.stringify({ error: "missing_contact", detail: "name, email, phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date) || !/^\d{2}:\d{2}$/.test(time_slot)) {
      return new Response(JSON.stringify({ error: "invalid_datetime", detail: "booking_date=YYYY-MM-DD, time_slot=HH:MM" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Resolve offer scoped to this workspace
    let offerQuery = supabase
      .from("offers")
      .select("id, slug")
      .eq("workspace_id", keyRow.workspace_id)
      .eq("is_active", true)
      .is("deleted_at", null);
    if (offer_slug) offerQuery = offerQuery.eq("slug", offer_slug);
    const { data: offer } = await offerQuery.limit(1).maybeSingle();

    if (!offer) {
      return new Response(JSON.stringify({ error: "offer_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delegate to handle-booking (single source of truth for calendar/emails/reminders)
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { data: hb, error: hbErr } = await supabase.functions.invoke("handle-booking", {
      body: {
        name, email, phone, booking_date, time_slot,
        offer_id: offer.id, notes, client_timezone,
      },
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (hbErr) {
      console.error("handle-booking invoke failed", hbErr);
      return new Response(JSON.stringify({ error: "booking_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("workspace_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);

    return new Response(JSON.stringify({ ok: true, ...(hb || {}) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("landing-book error", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
