// Analyse la conversation WhatsApp récente et détecte si un RDV a été confirmé.
// Si oui : crée un booking + event Google Calendar + active une activity.
// Appelée en fire-and-forget depuis whatsapp-webhook après chaque message inbound.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
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
  const data = await res.json();
  return data.access_token || null;
}

async function getGoogleAccessToken(admin: any, ownerId: string): Promise<string | null> {
  const { data: tokens } = await admin.from("google_tokens").select("*").eq("user_id", ownerId).maybeSingle();
  if (!tokens) return null;
  const expiresAt = new Date(tokens.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return tokens.access_token;
  const newToken = await refreshGoogleToken(tokens.refresh_token);
  if (newToken) {
    await admin.from("google_tokens").update({
      access_token: newToken,
      expires_at: new Date(Date.now() + 3500 * 1000).toISOString(),
    } as any).eq("user_id", ownerId);
  }
  return newToken;
}

async function createGoogleCalendarEvent(
  accessToken: string,
  name: string,
  email: string | null,
  bookingDate: string,
  timeSlot: string,
  offerName: string,
): Promise<{ eventId: string; meetLink: string | null } | null> {
  const start = new Date(`${bookingDate}T${timeSlot}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const event: any = {
    summary: `RDV - ${name} (${offerName})`,
    description: `Rendez-vous avec ${name}${email ? ` (${email})` : ""} pour "${offerName}" — détecté automatiquement depuis WhatsApp.`,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
    end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
    conferenceData: {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    },
    reminders: { useDefault: true },
  };
  if (email) event.attendees = [{ email }];

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) {
    console.error("GCal event creation failed:", await res.text());
    return null;
  }
  const data = await res.json();
  return {
    eventId: data.id,
    meetLink: data.conferenceData?.entryPoints?.[0]?.uri || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "Missing lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead } = await admin
      .from("leads")
      .select("id, name, email, phone, owner_id, workspace_id, offer_id, offers(name)")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupère les 10 derniers messages (contexte conversation)
    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("direction, content, sent_at")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(10);
    const messages = (history ?? []).reverse();
    if (messages.length < 2) {
      return new Response(JSON.stringify({ ok: true, detected: false, reason: "not_enough_messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = messages
      .map((m: any) => `[${m.direction === "inbound" ? "LEAD" : "MOI"} @ ${m.sent_at}] ${m.content}`)
      .join("\n");

    const today = new Date().toISOString().slice(0, 10);
    const detectionPrompt = `Tu analyses une conversation WhatsApp entre un commercial (MOI) et un prospect (LEAD).

Détermine si un RENDEZ-VOUS a été CONFIRMÉ par les DEUX parties (proposition par l'un + accord explicite de l'autre).
Un simple "ok je vais y réfléchir", "peut-être", "je te rappelle" n'est PAS une confirmation.
Un accord ferme sur une date + heure précise EST une confirmation.

Date du jour : ${today} (timezone Europe/Paris, horaires 11h–15h30 jours ouvrés).

Réponds UNIQUEMENT en JSON :
{
  "confirmed": true|false,
  "booking_date": "YYYY-MM-DD" | null,  // date résolue (ex: "vendredi" = prochain vendredi)
  "time_slot": "HH:MM" | null,          // format 24h sur tranches de 30min (11:00, 11:30, 12:00, etc.)
  "reason": "courte explication"
}

Conversation :
${transcript}`;

    const aiRes = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: detectionPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      console.error("AI detection failed:", await aiRes.text());
      return new Response(JSON.stringify({ ok: false, error: "ai_error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(aiData.choices?.[0]?.message?.content ?? "{}");
    } catch (_) {
      parsed = {};
    }

    if (!parsed.confirmed || !parsed.booking_date || !parsed.time_slot) {
      return new Response(
        JSON.stringify({ ok: true, detected: false, reason: parsed.reason ?? "not_confirmed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Vérifier qu'un booking pour ce lead/créneau n'existe pas déjà (idempotence)
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("booking_date", parsed.booking_date)
      .eq("time_slot", parsed.time_slot)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "booking_already_exists", booking_id: existing.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const offerName = (lead as any).offers?.name ?? "Consultation";

    // Créer event Google Calendar si token disponible
    let googleEventId: string | null = null;
    let meetLink: string | null = null;
    const accessToken = await getGoogleAccessToken(admin, lead.owner_id);
    if (accessToken) {
      const result = await createGoogleCalendarEvent(
        accessToken,
        lead.name,
        lead.email || null,
        parsed.booking_date,
        parsed.time_slot,
        offerName,
      );
      if (result) {
        googleEventId = result.eventId;
        meetLink = result.meetLink;
      }
    }

    // Créer le booking
    const bookingId = crypto.randomUUID();
    const { error: bookingErr } = await admin.from("bookings").insert({
      id: bookingId,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      offer_id: lead.offer_id,
      lead_id: lead.id,
      name: lead.name,
      email: lead.email || `${lead.phone}@whatsapp.tmp`,
      phone: lead.phone || "",
      booking_date: parsed.booking_date,
      time_slot: parsed.time_slot,
      notes: `RDV confirmé par IA depuis WhatsApp.\n${parsed.reason ?? ""}`,
      status: "confirmed",
      google_event_id: googleEventId,
      meet_link: meetLink,
      created_from: "conversation_ai",
    } as any);

    if (bookingErr) {
      console.error("Booking insert error:", bookingErr);
      return new Response(JSON.stringify({ ok: false, error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Activity + notif owner
    await admin.from("lead_activities").insert({
      lead_id: lead.id,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      activity_type: "meeting",
      description: `📅 RDV auto-détecté via WhatsApp : ${parsed.booking_date} à ${parsed.time_slot}${meetLink ? ` — ${meetLink}` : ""}`,
    } as any);

    // Push notif owner
    try {
      await admin.functions.invoke("send-onesignal-notification", {
        body: {
          user_id: lead.owner_id,
          title: `📅 RDV auto-créé — ${lead.name}`,
          body: `${parsed.booking_date} à ${parsed.time_slot} • ${offerName}`,
          url: `/bookings`,
          tag: `ai-booking-${bookingId}`.slice(0, 32),
        },
      });
    } catch (e) {
      console.error("Push notif failed:", e);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        detected: true,
        booking_id: bookingId,
        booking_date: parsed.booking_date,
        time_slot: parsed.time_slot,
        google_synced: !!googleEventId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("detect-booking-from-conversation error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
