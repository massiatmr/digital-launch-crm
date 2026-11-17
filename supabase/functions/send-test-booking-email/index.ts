import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TEMPLATES: Record<string, { subject: string; body_html: string }> = {
  confirmation: {
    subject: "✅ Votre rendez-vous est confirmé — {{date}} à {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Votre rendez-vous est bien confirmé pour le <strong>{{date}} à {{time}}</strong>{{offer_suffix}}.</p>
<p>{{meet_block}}</p>
<p>À très vite !</p>`,
  },
  "24h_before": {
    subject: "📅 Rappel — votre RDV est demain à {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Petit rappel : nous avons rendez-vous <strong>demain à {{time}}</strong>{{offer_suffix}}.</p>
<p>{{meet_block}}</p>
<p>À demain !</p>`,
  },
  "12h_before": {
    subject: "⏰ Votre RDV est dans 12h — {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Votre rendez-vous approche : <strong>{{date}} à {{time}}</strong>.</p>
<p>{{meet_block}}</p>`,
  },
  "1h_before": {
    subject: "🚀 Votre RDV commence dans 1h — {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Votre rendez-vous démarre dans 1h, à <strong>{{time}}</strong>.</p>
<p>{{meet_block}}</p>
<p>À tout de suite !</p>`,
  },
  "5min_before": {
    subject: "🔔 On se retrouve dans 5 min — {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>C'est le moment : on se retrouve dans <strong>5 minutes</strong>.</p>
<p>{{meet_block}}</p>`,
  },
};

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function wrapHtml(inner: string, title: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px;font-size:14px;line-height:1.6">${inner}</div>
</body></html>`;
}

async function resolveTemplate(
  supabase: any,
  type: string,
  offerId: string | null,
  workspaceId: string | null,
): Promise<{ subject: string; body_html: string }> {
  if (offerId) {
    const { data } = await supabase
      .from("offer_booking_email_templates")
      .select("subject, body_html, enabled")
      .eq("offer_id", offerId)
      .eq("type", type)
      .maybeSingle();
    if (data?.subject && data?.body_html) return { subject: data.subject, body_html: data.body_html };
  }
  if (workspaceId) {
    const { data } = await supabase
      .from("workspace_booking_email_templates")
      .select("subject, body_html, enabled")
      .eq("workspace_id", workspaceId)
      .eq("type", type)
      .maybeSingle();
    if (data?.subject && data?.body_html) return { subject: data.subject, body_html: data.body_html };
  }
  return DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.confirmation;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));

    // ---- MODE: send for real booking ----
    // payload: { bookingId, type ('confirmation'|'24h_before'|'12h_before'|'1h_before'), bookingEmailId? (link), subjectOverride?, bodyOverride? }
    if (body.bookingId && body.type) {
      const bookingId = String(body.bookingId);
      const type = String(body.type);
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, name, email, booking_date, time_slot, meet_link, offer_id, workspace_id, owner_id, offers(name, workspace_id)")
        .eq("id", bookingId)
        .maybeSingle();
      if (bErr || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (booking.owner_id !== user.id) {
        // allow workspace member
        const { data: isMember } = await supabase.rpc("is_workspace_member", {
          _workspace_id: booking.workspace_id,
          _user_id: user.id,
        });
        if (!isMember) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const tpl = await resolveTemplate(
        supabase,
        type,
        booking.offer_id,
        booking.workspace_id || (booking as any).offers?.workspace_id || null,
      );
      const subject = String(body.subjectOverride || tpl.subject);
      const bodyHtml = String(body.bodyOverride || tpl.body_html);

      const offerName = (booking as any).offers?.name || "";
      const dateStr = new Date(booking.booking_date + "T12:00:00Z").toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      });
      const meetLink = booking.meet_link || "";
      const vars: Record<string, string> = {
        name: booking.name || "",
        date: dateStr,
        time: booking.time_slot || "",
        offer_name: offerName,
        offer_suffix: offerName ? ` (${offerName})` : "",
        meet_link: meetLink,
        meet_block: meetLink
          ? `<a href="${meetLink}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a>`
          : "",
      };

      const renderedSubject = render(subject, vars);
      const renderedHtml = wrapHtml(render(bodyHtml, vars), renderedSubject);
      const to = String(body.to || booking.email);
      const messageId = `booking-manual-${bookingId}-${type}-${Date.now()}`;
      const templateName = `booking-${type}`;

      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: to,
        status: "pending",
        metadata: { manual: true, user_id: user.id, booking_id: bookingId, type, subject: renderedSubject },
      });

      const { error: sendErr } = await supabase.functions.invoke("send-smtp-email", {
        body: { to: [to], subject: renderedSubject, html: renderedHtml, workspaceId: booking.workspace_id || (booking as any).offers?.workspace_id || null },
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      });

      if (sendErr) {
        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: templateName,
          recipient_email: to,
          status: "failed",
          error_message: sendErr.message || String(sendErr),
          metadata: { manual: true, user_id: user.id, booking_id: bookingId, type },
        });
        throw sendErr;
      }

      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: to,
        status: "sent",
        metadata: { manual: true, user_id: user.id, booking_id: bookingId, type, subject: renderedSubject },
      });

      // Mark booking_emails row(s) of this type as sent (or insert a manual record)
      if (body.bookingEmailId) {
        await supabase
          .from("booking_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() } as any)
          .eq("id", String(body.bookingEmailId));
      } else {
        // Insert a manual record so it shows up in the timeline
        await supabase.from("booking_emails").insert({
          booking_id: bookingId,
          type,
          status: "sent",
          scheduled_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        } as any);
      }

      return new Response(JSON.stringify({ ok: true, to, subject: renderedSubject }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- MODE: legacy test / manual lead email ----
    const subject = String(body.subject || "").trim();
    const body_html = String(body.body_html || "").trim();
    const to = String(body.to || "").trim();
    const asReal = body.as_real === true;
    if (!subject || !body_html || !to || !/.+@.+\..+/.test(to)) {
      return new Response(JSON.stringify({ error: "subject, body_html and valid to required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.workspace_id) {
      const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: body.workspace_id, _user_id: user.id });
      if (!isMember) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (to.toLowerCase() !== String(user.email || "").toLowerCase()) {
      let ok = false;
      for (const t of ["leads", "clients"]) {
        let q = supabase.from(t).select("id").ilike("email", to).is("deleted_at", null).limit(1);
        q = body.workspace_id ? q.eq("workspace_id", body.workspace_id) : q.eq("owner_id", user.id);
        const { data } = await q;
        if (data && data.length) { ok = true; break; }
      }
      if (!ok) return new Response(JSON.stringify({ error: "Recipient must be yourself or one of your leads/clients" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const sample = {
      name: "Jean Dupont",
      date: dateStr,
      time: "14:00",
      offer_name: "Consultation",
      offer_suffix: " (Consultation)",
      meet_link: "https://meet.google.com/abc-defg-hij",
      meet_block: `<a href="https://meet.google.com/abc-defg-hij" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a>`,
      ...(body.sample_vars || {}),
    };

    const renderedSubject = asReal ? render(subject, sample) : `[TEST] ${render(subject, sample)}`;
    const renderedHtml = wrapHtml(render(body_html, sample), renderedSubject);

    const messageId = `${asReal ? "booking-manual" : "booking-test"}-${crypto.randomUUID()}`;
    const templateName = String(body.template_name || (asReal ? "booking-manual" : "booking-test"));

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: to,
      status: "pending",
      metadata: { test: !asReal, manual: asReal, user_id: user.id, subject: renderedSubject },
    });

    const { error: sendErr } = await supabase.functions.invoke("send-smtp-email", {
      body: { to: [to], subject: renderedSubject, html: renderedHtml, workspaceId: body.workspace_id ?? null },
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });

    if (sendErr) {
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: to,
        status: "failed",
        error_message: sendErr.message || String(sendErr),
        metadata: { test: !asReal, manual: asReal, user_id: user.id },
      });
      throw sendErr;
    }

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: to,
      status: "sent",
      metadata: { test: !asReal, manual: asReal, user_id: user.id, subject: renderedSubject },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-test-booking-email error", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
