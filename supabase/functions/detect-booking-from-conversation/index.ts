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
  // Build a Paris-local datetime string (no Z) so Google Calendar honours the timeZone field.
  const startLocal = `${bookingDate}T${timeSlot}:00`;
  // Compute end = start + 1h in local terms (handles cross-midnight via Date math then reformats)
  const [hh, mm] = timeSlot.split(":").map(Number);
  const endHour = (hh + 1) % 24;
  const endLocal = `${bookingDate}T${String(endHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  const event: any = {
    summary: `RDV - ${name} (${offerName})`,
    description: `Rendez-vous avec ${name}${email ? ` (${email})` : ""} pour "${offerName}" — détecté automatiquement depuis WhatsApp.`,
    start: { dateTime: startLocal, timeZone: "Europe/Paris" },
    end: { dateTime: endLocal, timeZone: "Europe/Paris" },
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

function formatBookingDateFr(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Paris",
    });
  } catch {
    return dateStr;
  }
}

async function sendBookingConfirmationWhatsApp(
  admin: any,
  lead: any,
  bookingDate: string,
  timeSlot: string,
  offerName: string,
  meetLink: string | null,
): Promise<void> {
  // Récupère config WA + dry_run
  let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
  if (lead.workspace_id) configQuery = configQuery.eq("workspace_id", lead.workspace_id);
  else configQuery = configQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
  const { data: config } = await configQuery.maybeSingle();

  let settingsQuery = admin.from("followup_automation_settings").select("dry_run");
  if (lead.workspace_id) settingsQuery = settingsQuery.eq("workspace_id", lead.workspace_id);
  else settingsQuery = settingsQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
  const { data: settings } = await settingsQuery.maybeSingle();
  const dryRun = settings?.dry_run !== false;

  const firstName = (lead.name || "").split(" ")[0] || "";
  const dateFr = formatBookingDateFr(bookingDate);
  const text = `Parfait ${firstName} 🙌 c'est noté : ${dateFr} à ${timeSlot} pour notre échange sur "${offerName}".

Je t'envoie aussi par email quelques ressources à parcourir avant le rendez-vous — ça nous permettra d'aller droit au but et de bâtir ensemble la stratégie qui te rapprochera vraiment de tes objectifs.${meetLink ? `\n\nLien de l'appel : ${meetLink}` : ""}

Bloque bien le créneau dans ton agenda, à très vite ! 🚀`;

  let waMessageId: string | null = null;
  let errorMessage: string | null = null;
  let logStatus = dryRun ? "dry_run" : "sent";

  if (!dryRun && config) {
    let phone = (lead.phone || "").replace(/[^\d+]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    if (phone.startsWith("0") && phone.length === 10) phone = "+33" + phone.slice(1);
    if (!phone.startsWith("+")) phone = "+" + phone;
    phone = phone.replace(/^\+/, "");
    if (phone) {
      try {
        const resp = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: text },
          }),
        });
        const data = await resp.json();
        if (!resp.ok) { errorMessage = JSON.stringify(data); logStatus = "failed"; }
        else { waMessageId = data.messages?.[0]?.id || null; }
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "send_failed";
        logStatus = "failed";
      }
    } else {
      errorMessage = "phone_invalid";
      logStatus = "failed";
    }
  }

  // IMPORTANT : metadata.sent_by_ai (PAS sent_by_user) → ne déclenche pas handle_manual_outbound (pas de pause)
  await admin.from("whatsapp_messages").insert({
    lead_id: lead.id,
    owner_id: lead.owner_id,
    workspace_id: lead.workspace_id ?? null,
    direction: "outbound",
    content: text,
    message_type: "text",
    status: logStatus,
    wa_message_id: waMessageId,
    error_message: errorMessage,
    metadata: { sent_by_ai: true, kind: "booking_confirmation" },
  } as any);
}

async function markLeadBookedAndStopAutomations(admin: any, lead: any, reason: string) {
  await admin.from("lead_conversation_state").upsert({
    lead_id: lead.id,
    owner_id: lead.owner_id,
    workspace_id: lead.workspace_id ?? null,
    state: "BOOKED",
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "lead_id" });

  await admin
    .from("lead_followup_tasks")
    .update({
      status: "cancelled",
      error_message: reason,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("lead_id", lead.id)
    .in("status", ["scheduled", "pending", "processing"])
    .neq("task_type", "manual_call");
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

    const { data: alreadyBooked } = await admin
      .from("bookings")
      .select("id, booking_date, time_slot")
      .eq("lead_id", lead_id)
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alreadyBooked) {
      await markLeadBookedAndStopAutomations(admin, lead, `Booking already exists (${alreadyBooked.id})`);
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "lead_already_booked", booking_id: alreadyBooked.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      await markLeadBookedAndStopAutomations(admin, lead, `Booking already exists (${existing.id})`);
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "booking_already_exists", booking_id: existing.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let resolvedOfferId: string | null = lead.offer_id ?? null;
    let offerName = (lead as any).offers?.name ?? "Consultation";

    // Fallback : si le lead n'a pas d'offre liée, on prend la 1ère offre active du workspace/owner
    if (!resolvedOfferId) {
      let fallbackQuery = admin
        .from("offers")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (lead.workspace_id) {
        fallbackQuery = fallbackQuery.eq("workspace_id", lead.workspace_id);
      } else {
        fallbackQuery = fallbackQuery.eq("owner_id", lead.owner_id);
      }
      const { data: fallbackOffer } = await fallbackQuery.maybeSingle();
      if (fallbackOffer) {
        resolvedOfferId = fallbackOffer.id;
        offerName = fallbackOffer.name;
        // Lier l'offre au lead pour les automatisations futures
        await admin.from("leads").update({ offer_id: resolvedOfferId } as any).eq("id", lead.id);
      }
    }

    if (!resolvedOfferId) {
      await markLeadBookedAndStopAutomations(admin, lead, "RDV confirmé mais aucune offre disponible dans le workspace — création booking ignorée");
      await admin.from("lead_activities").insert({
        lead_id: lead.id,
        owner_id: lead.owner_id,
        workspace_id: lead.workspace_id,
        activity_type: "meeting",
        description: `📅 RDV confirmé via WhatsApp (${parsed.booking_date} à ${parsed.time_slot}) mais aucune offre n'est disponible : booking non créé.`,
      } as any);
      return new Response(
        JSON.stringify({ ok: true, detected: true, skipped: true, reason: "no_offer_available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
      offer_id: resolvedOfferId,
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

    await markLeadBookedAndStopAutomations(admin, lead, `Booking auto-created (${bookingId})`);

    // Envoie un message de confirmation chaleureux au prospect (évite l'effet "ghosted")
    try {
      await sendBookingConfirmationWhatsApp(admin, lead, parsed.booking_date, parsed.time_slot, offerName, meetLink);
    } catch (e) {
      console.error("booking confirmation WA failed:", e);
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
