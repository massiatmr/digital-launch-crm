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
  const row = (label: string, value?: string | null) =>
    value
      ? `<p style="font-size:12px;color:#7c3aed;font-weight:600;margin:8px 0 2px;text-transform:uppercase;letter-spacing:0.5px">${label}</p>
         <p style="font-size:16px;color:#1a1a2e;font-weight:600;margin:0 0 8px">${escapeHtml(value)}</p>`
      : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:0 auto;padding:30px 25px">
    <h1 style="font-size:24px;font-weight:700;color:#1a1a2e;margin:0 0 16px">🔥 Nouveau lead reçu</h1>
    <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">
      Un nouveau prospect vient d'arriver dans ton CRM. Réagis vite — la rapidité de réponse double tes chances de closing.
    </p>
    <div style="background:#f4f0ff;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:4px solid #7c3aed">
      ${row("👤 Nom", lead.name)}
      ${row("🏢 Entreprise", lead.company_name)}
      ${row("✉️ Email", lead.email)}
      ${row("📱 Téléphone", lead.phone)}
      ${row("📥 Source", sourceLabel)}
      ${row("💬 Message", lead.message)}
    </div>
    <div style="text-align:center;margin:25px 0">
      <a href="${leadUrl}" style="background:#7c3aed;color:#fff;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;display:inline-block">
        Ouvrir la fiche lead
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0">
    <p style="font-size:13px;color:#999;margin:20px 0 0;line-height:1.5">
      Digital Launch CRM — notification automatique
    </p>
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
      const pushRes = await supabase.functions.invoke("send-push", {
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
