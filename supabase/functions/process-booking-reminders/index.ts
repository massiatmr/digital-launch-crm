// Process scheduled booking_emails (24h/12h/1h before reminder) — sends
// client reminder + optional admin reminder. Runs every minute via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";

type BookingEmailType = "confirmation" | "24h_before" | "12h_before" | "1h_before";

const DEFAULT_TEMPLATES: Record<BookingEmailType, { subject: string; body_html: string }> = {
  confirmation: {
    subject: "✅ Votre rendez-vous est confirmé — {{date}} à {{time}}",
    body_html: `<p>Bonjour {{name}},</p><p>Votre rendez-vous est bien confirmé pour le <strong>{{date}} à {{time}}</strong>{{offer_suffix}}.</p><p>{{meet_block}}</p><p>À très vite !</p>`,
  },
  "24h_before": {
    subject: "📅 Rappel — votre RDV est demain à {{time}}",
    body_html: `<p>Bonjour {{name}},</p><p>Petit rappel : nous avons rendez-vous <strong>demain à {{time}}</strong>{{offer_suffix}}.</p><p>{{meet_block}}</p>`,
  },
  "12h_before": {
    subject: "⏰ Votre RDV est dans 12h — {{time}}",
    body_html: `<p>Bonjour {{name}},</p><p>Votre rendez-vous approche : <strong>{{date}} à {{time}}</strong>.</p><p>{{meet_block}}</p>`,
  },
  "1h_before": {
    subject: "🚀 Votre RDV commence dans 1h — {{time}}",
    body_html: `<p>Bonjour {{name}},</p><p>Votre rendez-vous démarre dans 1h, à <strong>{{time}}</strong>.</p><p>{{meet_block}}</p><p>À tout de suite !</p>`,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const nowIso = new Date().toISOString();
    // All reminder types (confirmation is handled directly by handle-booking)
    const { data: due, error } = await supabase
      .from("booking_emails")
      .select("id, booking_id, type")
      .eq("status", "pending")
      .in("type", ["24h_before", "12h_before", "1h_before"])
      .lte("scheduled_at", nowIso)
      .limit(50);
    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const row of due) {
      try {
        const { data: booking } = await supabase
          .from("bookings")
          .select("id, owner_id, workspace_id, lead_id, offer_id, name, email, phone, booking_date, time_slot, meet_link, notes")
          .eq("id", row.booking_id)
          .maybeSingle();
        if (!booking || (booking as any).deleted_at) {
          await supabase.from("booking_emails").update({ status: "skipped", sent_at: nowIso } as any).eq("id", row.id);
          continue;
        }

        // Workspace info (incl. admin reminders toggle + members)
        let workspaceName: string | null = null;
        let workspaceEmail: string | null = null;
        let adminRemindersEnabled = true;
        const memberEmails: string[] = [];
        if (booking.workspace_id) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("company_name, notification_email, email, booking_admin_reminders_enabled")
            .eq("id", booking.workspace_id)
            .maybeSingle();
          workspaceName = (ws as any)?.company_name || null;
          workspaceEmail = (((ws as any)?.notification_email || (ws as any)?.email) || "").trim() || null;
          if ((ws as any)?.booking_admin_reminders_enabled === false) adminRemindersEnabled = false;

          const { data: members } = await supabase
            .from("workspace_members").select("user_id").eq("workspace_id", booking.workspace_id);
          for (const m of members || []) {
            try {
              const { data: u } = await supabase.auth.admin.getUserById((m as any).user_id);
              if (u?.user?.email) memberEmails.push(u.user.email);
            } catch (_) { /* ignore */ }
          }
        }
        if (memberEmails.length === 0 && booking.owner_id) {
          try {
            const { data: u } = await supabase.auth.admin.getUserById(booking.owner_id);
            if (u?.user?.email) memberEmails.push(u.user.email);
          } catch (_) { /* ignore */ }
        }

        // Offer + workspace_id + template overrides (per offer, fallback workspace, fallback default)
        let offerName = "";
        let offerWorkspaceId: string | null = null;
        if (booking.offer_id) {
          const { data: offer } = await supabase
            .from("offers").select("name, workspace_id").eq("id", booking.offer_id).maybeSingle();
          offerName = (offer as any)?.name || "";
          offerWorkspaceId = (offer as any)?.workspace_id || null;
        }

        let tplEnabled = true;
        let tplSubject = DEFAULT_TEMPLATES[row.type as BookingEmailType].subject;
        let tplBody = DEFAULT_TEMPLATES[row.type as BookingEmailType].body_html;
        let resolved = false;
        if (booking.offer_id) {
          const { data: tpl } = await supabase
            .from("offer_booking_email_templates")
            .select("enabled, subject, body_html")
            .eq("offer_id", booking.offer_id)
            .eq("type", row.type)
            .maybeSingle();
          if (tpl) {
            resolved = true;
            tplEnabled = (tpl as any).enabled !== false;
            if ((tpl as any).subject) tplSubject = (tpl as any).subject;
            if ((tpl as any).body_html) tplBody = (tpl as any).body_html;
          }
        }
        if (!resolved && offerWorkspaceId) {
          const { data: wsTpl } = await supabase
            .from("workspace_booking_email_templates")
            .select("enabled, subject, body_html")
            .eq("workspace_id", offerWorkspaceId)
            .eq("type", row.type)
            .maybeSingle();
          if (wsTpl) {
            tplEnabled = (wsTpl as any).enabled !== false;
            if ((wsTpl as any).subject) tplSubject = (wsTpl as any).subject;
            if ((wsTpl as any).body_html) tplBody = (wsTpl as any).body_html;
          }
        }

        if (!tplEnabled) {
          await supabase.from("booking_emails").update({ status: "skipped", sent_at: nowIso } as any).eq("id", row.id);
          continue;
        }

        const meetBlock = booking.meet_link
          ? `<a href="${booking.meet_link}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a>`
          : "";
        const vars: Record<string, string> = {
          name: booking.name,
          date: booking.booking_date,
          time: booking.time_slot,
          offer_name: offerName,
          offer_suffix: offerName ? ` (${offerName})` : "",
          meet_link: booking.meet_link || "",
          meet_block: meetBlock,
        };

        const subject = render(tplSubject, vars);
        const html = wrapHtml(render(tplBody, vars), subject);

        // 1) Email au client
        if (booking.email) {
          try {
            await supabase.functions.invoke("send-smtp-email", {
              body: { to: [booking.email], subject, html },
            });
          } catch (e) {
            console.error("[process-booking-reminders] client send failed", e);
          }
        }

        // 2) Email admin uniquement sur le rappel 1h, si activé
        if (row.type === "1h_before" && adminRemindersEnabled) {
          const recipients = Array.from(new Set(
            [ADMIN_NOTIFY_EMAIL, workspaceEmail, ...memberEmails].filter((e): e is string => !!e)
          ));
          if (recipients.length > 0) {
            const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
            const leadUrl = booking.lead_id ? `${APP_BASE_URL}/leads/${booking.lead_id}` : APP_BASE_URL;
            const adminHtml = wrapHtml(`
              <h1 style="font-size:20px;font-weight:700;margin:0 0 6px">⏰ Rappel — RDV dans 1h</h1>
              ${workspaceName ? `<div style="font-size:13px;color:#6b7280;margin:0 0 16px">Espace : ${workspaceName}</div>` : ""}
              <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:18px 0;border-left:3px solid #7c3aed">
                <p style="font-size:13px;color:#6b7280;margin:0">Prospect</p>
                <p style="font-size:16px;margin:2px 0 10px;font-weight:600">${booking.name}</p>
                <p style="font-size:13px;color:#6b7280;margin:0">Créneau</p>
                <p style="margin:2px 0 10px">${booking.booking_date} à ${booking.time_slot}${offerName ? ` — ${offerName}` : ""}</p>
                ${booking.email ? `<p style="font-size:13px;color:#6b7280;margin:0">Email</p><p style="margin:2px 0 10px">${booking.email}</p>` : ""}
                ${booking.phone ? `<p style="font-size:13px;color:#6b7280;margin:0">Téléphone</p><p style="margin:2px 0 10px">${booking.phone}</p>` : ""}
                ${booking.meet_link ? `<p style="margin:8px 0"><a href="${booking.meet_link}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a></p>` : ""}
              </div>
              <a href="${leadUrl}" style="background:#7c3aed;color:#fff;padding:11px 22px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block">Ouvrir la fiche lead</a>
            `, "RDV dans 1h");
            try {
              await supabase.functions.invoke("send-smtp-email", {
                body: {
                  to: recipients,
                  subject: `⏰ ${wsPrefix}RDV dans 1h — ${booking.name} (${booking.time_slot})`,
                  html: adminHtml,
                  replyTo: booking.email || undefined,
                },
              });
            } catch (e) {
              console.error("[process-booking-reminders] admin send failed", e);
            }
          }
        }

        await supabase.from("booking_emails").update({
          status: "sent", sent_at: new Date().toISOString(),
        } as any).eq("id", row.id);
        processed++;
      } catch (e) {
        console.error("[process-booking-reminders] row failed", row.id, e);
        await supabase.from("booking_emails").update({
          status: "failed", sent_at: new Date().toISOString(),
        } as any).eq("id", row.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-booking-reminders] error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
