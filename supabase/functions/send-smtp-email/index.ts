// Generic SMTP sender. Replaces Lovable Email infra for transactional sends.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Attachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

interface Payload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: Attachment[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "587");
  const SMTP_USER = Deno.env.get("SMTP_USER");
  const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD");
  const SMTP_FROM_EMAIL = Deno.env.get("SMTP_FROM") || SMTP_USER;
  const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "Digital Launch Agency";
  // Format as "Name <email>" if not already formatted
  const SMTP_FROM = SMTP_FROM_EMAIL?.includes("<")
    ? SMTP_FROM_EMAIL
    : `${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>`;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    return new Response(JSON.stringify({ error: "SMTP not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { to, subject, html, text, replyTo, attachments } = payload;
  if (!to || !subject || (!html && !text)) {
    return new Response(JSON.stringify({ error: "to, subject and html/text required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Port 465 = implicit TLS, others (587/25) = STARTTLS
  const useTls = SMTP_PORT === 465;

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: useTls,
      auth: { username: SMTP_USER, password: SMTP_PASSWORD },
    },
  });

  try {
    await client.send({
      from: SMTP_FROM!,
      to,
      replyTo,
      subject,
      content: text || "",
      html: html || undefined,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      })),
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SMTP send failed:", e);
    try { await client.close(); } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
