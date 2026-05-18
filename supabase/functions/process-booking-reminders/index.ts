// Process scheduled booking_emails (1h_before reminder) by sending an email
// to all workspace members + admin. Runs every minute via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Pick due reminders (1h_before only — other types are not used yet)
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("booking_emails")
      .select("id, booking_id, type")
      .eq("status", "pending")
      .eq("type", "1h_before")
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

        // Resolve workspace + member emails
        let workspaceName: string | null = null;
        let workspaceEmail: string | null = null;
        const memberEmails: string[] = [];
        if (booking.workspace_id) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("company_name, notification_email, email")
            .eq("id", booking.workspace_id)
            .maybeSingle();
          workspaceName = (ws as any)?.company_name || null;
          workspaceEmail = (((ws as any)?.notification_email || (ws as any)?.email) || "").trim() || null;

          const { data: members } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", booking.workspace_id);
          for (const m of members || []) {
            try {
              const { data: u } = await supabase.auth.admin.getUserById((m as any).user_id);
              if (u?.user?.email) memberEmails.push(u.user.email);
            } catch (_) { /* ignore */ }
          }
        }
        // Fallback : owner email
        if (memberEmails.length === 0 && booking.owner_id) {
          try {
            const { data: u } = await supabase.auth.admin.getUserById(booking.owner_id);
            if (u?.user?.email) memberEmails.push(u.user.email);
          } catch (_) { /* ignore */ }
        }

        // Offer name
        let offerName = "";
        if (booking.offer_id) {
          const { data: offer } = await supabase
            .from("offers").select("name").eq("id", booking.offer_id).maybeSingle();
          offerName = (offer as any)?.name || "";
        }

        const recipients = Array.from(new Set(
          [ADMIN_NOTIFY_EMAIL, workspaceEmail, ...memberEmails].filter((e): e is string => !!e)
        ));
        if (recipients.length === 0) {
          await supabase.from("booking_emails").update({ status: "skipped", sent_at: nowIso } as any).eq("id", row.id);
          continue;
        }

        const wsPrefix = workspaceName ? `[${workspaceName}] ` : "";
        const leadUrl = booking.lead_id ? `${APP_BASE_URL}/leads/${booking.lead_id}` : APP_BASE_URL;
        const meetRow = booking.meet_link
          ? `<p style="margin:8px 0"><a href="${booking.meet_link}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a></p>`
          : "";

        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 6px">⏰ Rappel — RDV dans 1h</h1>
    ${workspaceName ? `<div style="font-size:13px;color:#6b7280;margin:0 0 16px">Espace : ${workspaceName}</div>` : ""}
    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:18px 0;border-left:3px solid #7c3aed">
      <p style="font-size:13px;color:#6b7280;margin:0">Prospect</p>
      <p style="font-size:16px;color:#111827;margin:2px 0 10px;font-weight:600">${booking.name}</p>
      <p style="font-size:13px;color:#6b7280;margin:0">Créneau</p>
      <p style="font-size:15px;color:#111827;margin:2px 0 10px">${booking.booking_date} à ${booking.time_slot}${offerName ? ` — ${offerName}` : ""}</p>
      ${booking.email ? `<p style="font-size:13px;color:#6b7280;margin:0">Email</p><p style="font-size:14px;color:#111827;margin:2px 0 10px">${booking.email}</p>` : ""}
      ${booking.phone ? `<p style="font-size:13px;color:#6b7280;margin:0">Téléphone</p><p style="font-size:14px;color:#111827;margin:2px 0 10px">${booking.phone}</p>` : ""}
      ${meetRow}
    </div>
    <div style="margin:22px 0">
      <a href="${leadUrl}" style="background:#7c3aed;color:#fff;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">
        Ouvrir la fiche lead
      </a>
    </div>
  </div>
</body></html>`;

        const { error: sendErr } = await supabase.functions.invoke("send-smtp-email", {
          body: {
            to: recipients,
            subject: `⏰ ${wsPrefix}RDV dans 1h — ${booking.name} (${booking.time_slot})`,
            html,
            replyTo: booking.email || undefined,
          },
        });
        if (sendErr) throw sendErr;

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
