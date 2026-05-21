// Generic SMTP sender. Uses nodemailer (battle-tested MIME/QP encoder) to
// avoid the quoted-printable bugs in denomailer that corrupted subjects and HTML.
import nodemailer from "npm:nodemailer@6.9.16";

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

  // Require service role — this endpoint is internal-only
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "587");
  const SMTP_USER = Deno.env.get("SMTP_USER");
  const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD");
  const SMTP_FROM_EMAIL = Deno.env.get("SMTP_FROM") || SMTP_USER;
  const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "Digital Launch Agency";
  const SMTP_FROM = SMTP_FROM_EMAIL?.includes("<")
    ? SMTP_FROM_EMAIL
    : `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`;

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

  const useTls = SMTP_PORT === 465; // implicit TLS on 465, STARTTLS otherwise

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: useTls,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  try {
    const plainText =
      text ||
      (html
        ? html
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim()
        : "");

    await transporter.sendMail({
      from: SMTP_FROM!,
      to,
      replyTo,
      subject,
      text: plainText,
      html,
      // Force base64 to avoid any QP line-wrap corruption on accented chars/emojis
      encoding: "base64",
      textEncoding: "base64",
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      })),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SMTP send failed:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
