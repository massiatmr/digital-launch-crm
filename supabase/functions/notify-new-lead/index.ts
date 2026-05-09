// Sends push + email notification to the CRM owner when a new lead arrives.
// Email goes through SMTP (send-smtp-email) — no DNS / Lovable Email needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

// Parse les notes structurées générées par facebook-webhook
// Sections balisées par "📋 Réponses au formulaire" et "ℹ️ Source"
// Renvoie { formAnswers: [{label,value}], sourceMeta: [{label,value}], rawFallback?: string }
function parseStructuredNotes(notes: string | null): {
  formAnswers: Array<{ label: string; value: string }>;
  sourceMeta: Array<{ label: string; value: string }>;
  rawFallback: string | null;
} {
  if (!notes) return { formAnswers: [], sourceMeta: [], rawFallback: null };
  const isStructured = notes.includes("📋 Réponses au formulaire") || notes.includes("ℹ️ Source");
  if (!isStructured) {
    return { formAnswers: [], sourceMeta: [], rawFallback: notes };
  }
  const formAnswers: Array<{ label: string; value: string }> = [];
  const sourceMeta: Array<{ label: string; value: string }> = [];
  let section: "form" | "source" | null = null;
  for (const rawLine of notes.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("📋")) { section = "form"; continue; }
    if (line.startsWith("ℹ️")) { section = "source"; continue; }
    if (line.startsWith("📘")) continue; // header
    if (!line.startsWith("•")) continue;
    const content = line.replace(/^•\s*/, "");
    const idx = content.indexOf(" : ");
    if (idx === -1) continue;
    const label = content.slice(0, idx).trim();
    const value = content.slice(idx + 3).trim();
    if (section === "form") formAnswers.push({ label, value });
    else if (section === "source") sourceMeta.push({ label, value });
  }
  return { formAnswers, sourceMeta, rawFallback: null };
}

function buildEmailHtml(lead: any, leadUrl: string, sourceLabel: string, workspaceName: string | null) {
  const mailLink = lead.email ? `mailto:${lead.email}` : null;
  const telLink = lead.phone ? `tel:${lead.phone}` : null;

  const row = (label: string, value?: string | null, href?: string | null) => {
    if (!value) return "";
    const valueHtml = href
      ? `<a href="${href}" style="color:#2563eb;text-decoration:none">${escapeHtml(value)}</a>`
      : `<span style="color:#111827">${escapeHtml(value)}</span>`;
    return `<tr>
      <td style="padding:8px 12px 8px 0;font-size:13px;color:#6b7280;font-weight:500;vertical-align:top;width:160px">${escapeHtml(label)}</td>
      <td style="padding:8px 0;font-size:14px;color:#111827;vertical-align:top">${valueHtml}</td>
    </tr>`;
  };

  // Tous les champs additionnels du lead (hors champs connus)
  const extraFields: Array<[string, string]> = [];
  const knownKeys = new Set([
    "id", "name", "email", "phone", "company_name", "source", "message", "owner_id",
    "workspace_id", "created_at", "updated_at", "status", "score", "show_status",
    "notes", "next_action", "next_action_date", "sales_angle", "ai_summary",
    "last_contacted_at", "first_contacted_at", "lost_reason", "offer_id",
    "deleted_at", "whatsapp_engagement_score",
  ]);
  for (const [k, v] of Object.entries(lead)) {
    if (knownKeys.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    extraFields.push([label, String(v)]);
  }

  const messageBlock = lead.message
    ? `<tr><td colspan="2" style="padding:16px 0 8px">
        <div style="font-size:12px;color:#6b7280;font-weight:500;margin-bottom:6px">Message initial</div>
        <div style="padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;font-size:14px;color:#374151;line-height:1.5;white-space:pre-wrap">${escapeHtml(lead.message)}</div>
      </td></tr>`
    : "";

  // Parsing des notes : si structurées (Facebook), on étale les réponses dans le tableau.
  const { formAnswers, sourceMeta, rawFallback } = parseStructuredNotes(lead.notes);

  const formAnswersBlock = formAnswers.length
    ? `<tr><td colspan="2" style="padding:18px 0 4px">
        <div style="font-size:12px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">📋 Réponses au formulaire</div>
       </td></tr>` + formAnswers.map(({ label, value }) => row(label, value)).join("")
    : "";

  const sourceMetaBlock = sourceMeta.length
    ? `<tr><td colspan="2" style="padding:18px 0 4px">
        <div style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">ℹ️ Métadonnées</div>
       </td></tr>` + sourceMeta.map(({ label, value }) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:12px;color:#9ca3af;vertical-align:top;width:160px">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:12px;color:#6b7280;vertical-align:top">${escapeHtml(value)}</td></tr>`
      ).join("")
    : "";

  const notesFallbackBlock = rawFallback
    ? `<tr><td colspan="2" style="padding:8px 0">
        <div style="font-size:12px;color:#6b7280;font-weight:500;margin-bottom:6px">Notes</div>
        <div style="padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;font-size:14px;color:#374151;line-height:1.5;white-space:pre-wrap">${escapeHtml(rawFallback)}</div>
      </td></tr>`
    : "";

  const extrasBlock = extraFields.length
    ? extraFields.map(([k, v]) => row(k, v)).join("")
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;color:#111827">
  <div style="padding:24px 16px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">

      <div style="padding:24px 28px 16px;border-bottom:1px solid #f3f4f6">
        <div style="font-size:13px;color:#6b7280;font-weight:500;margin-bottom:4px">Nouveau lead${workspaceName ? ` · ${escapeHtml(workspaceName)}` : ""}</div>
        <h1 style="font-size:20px;font-weight:600;color:#111827;margin:0">${escapeHtml(lead.name || "Sans nom")}</h1>
        ${lead.company_name ? `<div style="font-size:14px;color:#6b7280;margin-top:4px">${escapeHtml(lead.company_name)}</div>` : ""}
      </div>

      <div style="padding:20px 28px">
        <table style="width:100%;border-collapse:collapse">
          ${row("Source", sourceLabel)}
          ${row("Email", lead.email, mailLink)}
          ${row("Téléphone", lead.phone, telLink)}
          ${extrasBlock}
          ${messageBlock}
          ${formAnswersBlock}
          ${notesFallbackBlock}
          ${sourceMetaBlock}
        </table>

        <div style="margin-top:24px">
          <a href="${leadUrl}" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;text-decoration:none">
            Ouvrir la fiche lead
          </a>
        </div>
      </div>

      <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #f3f4f6">
        <p style="font-size:12px;color:#9ca3af;margin:0">Notification automatique · Digital Launch CRM</p>
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

    // Récupère TOUS les champs du lead (pour inclure tous les détails du formulaire)
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr || !lead) {
      console.error("notify-new-lead: lead lookup failed", leadErr);
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupère le workspace (juste pour le nom dans l'email)
    let workspaceName: string | null = null;
    const memberEmails: string[] = [];
    const memberUserIds: string[] = [];
    if (lead.workspace_id) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("company_name")
        .eq("id", lead.workspace_id)
        .maybeSingle();
      workspaceName = ws?.company_name || null;

      // Récupère UNIQUEMENT les membres ACTUELS du workspace (owner + members)
      // Les membres retirés ne doivent plus recevoir de notifications.
      const { data: members, error: memErr } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", lead.workspace_id);
      if (memErr) {
        console.error("notify-new-lead: workspace_members lookup failed", memErr);
      } else if (Array.isArray(members) && members.length > 0) {
        const userIds = members.map((m: any) => m.user_id).filter(Boolean);
        for (const uid of userIds) memberUserIds.push(uid);

        for (const uid of userIds) {
          try {
            const { data: u } = await (supabase as any).auth.admin.getUserById(uid);
            const em = u?.user?.email;
            if (em) memberEmails.push(em);
          } catch (e) {
            console.error("notify-new-lead: getUserById failed", uid, e);
          }
        }
      }
    }

    // Destinataires email : UNIQUEMENT les membres actuels du workspace.
    // (Plus de NOTIFY_EMAIL hardcodé ni de workspace.email pour éviter les fuites
    // vers d'anciens membres retirés.)
    const recipients = Array.from(new Set(
      memberEmails
        .filter((e): e is string => !!e && e.trim() !== "")
        .map((e) => e.trim().toLowerCase())
    ));

    // Destinataires push : tous les membres actuels (fallback sur owner si aucun)
    const pushUserIds = Array.from(new Set(
      memberUserIds.length ? memberUserIds : [lead.owner_id].filter(Boolean)
    ));

    if (recipients.length === 0) {
      console.warn("notify-new-lead: no recipients for lead", lead.id);
    }

    const leadUrl = `${APP_BASE_URL}/leads/${lead.id}`;
    const sourceLabel = sourceLabels[lead.source] || lead.source || "Inconnue";
    const titleSuffix = lead.company_name ? ` (${lead.company_name})` : "";
    const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
    const results: Record<string, unknown> = {};

    // ---- 1) Push à tous les membres du workspace
    const pushResults: any[] = [];
    for (const uid of pushUserIds) {
      try {
        const pushRes = await supabase.functions.invoke("send-onesignal-notification", {
          body: {
            user_id: uid,
            title: `${wsPrefix}Nouveau lead — ${lead.name}${titleSuffix}`,
            body: `${sourceLabel} • ${lead.phone || lead.email || "pas de contact"}`,
            url: `/leads/${lead.id}`,
            tag: `new-lead-${lead.id}`,
          },
        });
        pushResults.push({ user_id: uid, ...(pushRes.data ?? { error: pushRes.error?.message }) });
      } catch (e) {
        pushResults.push({ user_id: uid, error: e instanceof Error ? e.message : String(e) });
      }
    }
    results.push = pushResults;

    // ---- 2) Email via SMTP (admin global + workspace si défini)
    try {
      const emailRes = await supabase.functions.invoke("send-smtp-email", {
        body: {
          to: recipients,
          subject: `${wsPrefix}Nouveau lead — ${lead.name}${titleSuffix}`,
          html: buildEmailHtml(lead, leadUrl, sourceLabel, workspaceName),
          replyTo: lead.email || undefined,
        },
      });
      results.email = { recipients, ...(emailRes.data ?? { error: emailRes.error?.message }) };
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
