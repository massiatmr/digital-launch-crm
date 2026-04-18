// Sends push + email notification to the CRM owner when a new lead arrives.
// Email goes through SMTP (send-smtp-email) — no DNS / Lovable Email needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";

const sourceLabels: Record<string, string> = {
  facebook: "Facebook Ads",
  website: "Site web",
  google_sheets: "Google Sheets",
  manual: "Saisie manuelle",
  organic_social: "Réseaux organic",
  recommendation: "Recommandation",
  google_my_business: "Google My Business",
  other: "Autre",
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildEmailHtml(lead: any, leadUrl: string, sourceLabel: string) {
  const waLink = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^\d]/g, "")}`
    : null;
  const mailLink = lead.email ? `mailto:${lead.email}` : null;
  const telLink = lead.phone ? `tel:${lead.phone}` : null;

  const row = (icon: string, label: string, value?: string | null, href?: string | null) => {
    if (!value) return "";
    const valueHtml = href
      ? `<a href="${href}" style="color:#A78BFA;text-decoration:none;font-weight:600">${escapeHtml(value)}</a>`
      : `<span style="color:#F4F4F8;font-weight:600">${escapeHtml(value)}</span>`;
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);width:32px;vertical-align:top;font-size:18px;line-height:1.4">${icon}</td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top">
        <div style="font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px">${label}</div>
        <div style="font-size:15px;line-height:1.4">${valueHtml}</div>
      </td>
    </tr>`;
  };

  const messageBlock = lead.message
    ? `<div style="margin:20px 0 0;padding:16px 18px;background:rgba(124,58,237,0.08);border-left:3px solid #7C3AED;border-radius:6px">
        <div style="font-size:11px;color:#A78BFA;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">💬 Message du prospect</div>
        <div style="font-size:14px;color:#E5E7EB;line-height:1.6;font-style:italic">"${escapeHtml(lead.message)}"</div>
      </div>`
    : "";

  const quickActions = (waLink || telLink || mailLink)
    ? `<div style="text-align:center;margin:8px 0 24px">
        <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Actions rapides</div>
        ${waLink ? `<a href="${waLink}" style="display:inline-block;margin:4px 6px;padding:10px 16px;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25D366;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">💬 WhatsApp</a>` : ""}
        ${telLink ? `<a href="${telLink}" style="display:inline-block;margin:4px 6px;padding:10px 16px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);color:#A78BFA;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">📞 Appeler</a>` : ""}
        ${mailLink ? `<a href="${mailLink}" style="display:inline-block;margin:4px 6px;padding:10px 16px;background:rgba(96,165,250,0.15);border:1px solid rgba(96,165,250,0.3);color:#60A5FA;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">✉️ Email</a>` : ""}
      </div>`
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0A0A0F;font-family:'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif;margin:0;padding:0;color:#F4F4F8">
  <div style="background:#0A0A0F;padding:30px 16px">
    <div style="max-width:560px;margin:0 auto;background:linear-gradient(180deg,#14141F 0%,#0F0F18 100%);border:1px solid rgba(124,58,237,0.2);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.15)">

      <!-- Header avec gradient -->
      <div style="background:linear-gradient(135deg,#7C3AED 0%,#A855F7 50%,#06B6D4 100%);padding:28px 32px;text-align:center">
        <div style="display:inline-block;background:rgba(0,0,0,0.25);padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">⚡ Nouveau Lead</div>
        <h1 style="font-size:26px;font-weight:800;color:#fff;margin:0;letter-spacing:-0.5px;text-shadow:0 2px 8px rgba(0,0,0,0.3)">${escapeHtml(lead.name || "Sans nom")}</h1>
        ${lead.company_name ? `<p style="font-size:14px;color:rgba(255,255,255,0.85);margin:6px 0 0;font-weight:500">${escapeHtml(lead.company_name)}</p>` : ""}
      </div>

      <!-- Body -->
      <div style="padding:28px 32px">

        <!-- Urgence banner -->
        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px 16px;margin-bottom:24px;text-align:center">
          <span style="font-size:13px;color:#FBBF24;font-weight:600">⏱️ Réponds dans les 5 minutes pour x9 tes chances de closing</span>
        </div>

        <!-- Source badge -->
        <div style="text-align:center;margin-bottom:20px">
          <span style="display:inline-block;padding:6px 14px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:20px;font-size:12px;color:#A78BFA;font-weight:600">📥 ${escapeHtml(sourceLabel)}</span>
        </div>

        <!-- Détails contact -->
        <table style="width:100%;border-collapse:collapse">
          ${row("✉️", "Email", lead.email, mailLink)}
          ${row("📱", "Téléphone", lead.phone, telLink)}
        </table>

        ${messageBlock}

        <!-- CTA principal -->
        <div style="text-align:center;margin:28px 0 8px">
          <a href="${leadUrl}" style="display:inline-block;background:linear-gradient(135deg,#7C3AED 0%,#A855F7 100%);color:#fff;padding:16px 36px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 8px 24px rgba(124,58,237,0.4);letter-spacing:0.3px">
            Ouvrir la fiche lead →
          </a>
        </div>

        ${quickActions}

      </div>

      <!-- Footer -->
      <div style="background:rgba(0,0,0,0.3);padding:18px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center">
        <p style="font-size:12px;color:#6B7280;margin:0;font-weight:500">
          <span style="color:#A78BFA">Digital Launch CRM</span> · Notification automatique
        </p>
      </div>

    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, email, phone, company_name, source, message, owner_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr || !lead) {
      console.error("notify-new-lead: lead lookup failed", leadErr);
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadUrl = `${APP_BASE_URL}/leads/${lead.id}`;
    const sourceLabel = sourceLabels[lead.source] || lead.source || "Inconnue";
    const titleSuffix = lead.company_name ? ` (${lead.company_name})` : "";
    const results: Record<string, unknown> = {};

    // ---- 1) Push
    try {
      const pushRes = await supabase.functions.invoke("send-onesignal-notification", {
        body: {
          user_id: lead.owner_id,
          title: `🔥 Nouveau lead — ${lead.name}${titleSuffix}`,
          body: `${sourceLabel} • ${lead.phone || lead.email || "pas de contact"}`,
          url: `/leads/${lead.id}`,
          tag: `new-lead-${lead.id}`,
        },
      });
      results.push = pushRes.data ?? { error: pushRes.error?.message };
    } catch (e) {
      results.push = { error: e instanceof Error ? e.message : String(e) };
    }

    // ---- 2) Email via SMTP
    try {
      const emailRes = await supabase.functions.invoke("send-smtp-email", {
        body: {
          to: NOTIFY_EMAIL,
          subject: `🔥 Nouveau lead — ${lead.name}${titleSuffix}`,
          html: buildEmailHtml(lead, leadUrl, sourceLabel),
          replyTo: lead.email || undefined,
        },
      });
      results.email = emailRes.data ?? { error: emailRes.error?.message };
    } catch (e) {
      results.email = { error: e instanceof Error ? e.message : String(e) };
    }

    return new Response(JSON.stringify({ ok: true, lead_id, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-new-lead error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
