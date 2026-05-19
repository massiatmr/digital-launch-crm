import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    const body_html = String(body.body_html || "").trim();
    const to = String(body.to || "").trim();
    if (!subject || !body_html || !to || !/.+@.+\..+/.test(to)) {
      return new Response(JSON.stringify({ error: "subject, body_html and valid to required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const renderedSubject = `[TEST] ${render(subject, sample)}`;
    const renderedHtml = wrapHtml(render(body_html, sample), renderedSubject);

    const messageId = `booking-test-${crypto.randomUUID()}`;
    const templateName = String(body.template_name || "booking-test");

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: to,
      status: "pending",
      metadata: { test: true, user_id: user.id, subject: renderedSubject },
    });

    const { error: sendErr } = await supabase.functions.invoke("send-smtp-email", {
      body: { to: [to], subject: renderedSubject, html: renderedHtml },
    });

    if (sendErr) {
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: to,
        status: "failed",
        error_message: sendErr.message || String(sendErr),
        metadata: { test: true, user_id: user.id },
      });
      throw sendErr;
    }

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: to,
      status: "sent",
      metadata: { test: true, user_id: user.id, subject: renderedSubject },
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
