// Cron: process booking_wa_reminders due → send template HSM via WhatsApp Cloud API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p.replace(/^\+/, "");
}

function fmtParis(dateStr: string, time: string) {
  // dateStr: YYYY-MM-DD, time: HH:MM
  try {
    const d = new Date(`${dateStr}T${time}:00`);
    const dateFmt = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
    }).format(d);
    return { date: dateFmt, time };
  } catch { return { date: dateStr, time }; }
}

function renderVar(tpl: string, vars: Record<string, string>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isServiceRole = bearer.length > 0 && (bearer === SERVICE_KEY);
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("booking_wa_reminders")
    .select("id, booking_id, type")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: any[] = [];

  for (const row of due ?? []) {
    try {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, name, email, phone, booking_date, time_slot, meet_link, workspace_id, owner_id, lead_id, offer_id")
        .eq("id", row.booking_id)
        .maybeSingle();
      if (!booking) {
        await supabase.from("booking_wa_reminders").update({ status: "failed", error_message: "booking not found", sent_at: nowIso }).eq("id", row.id);
        results.push({ id: row.id, status: "failed" });
        continue;
      }

      if (!booking.workspace_id) {
        await supabase.from("booking_wa_reminders").update({ status: "skipped", error_message: "no workspace", sent_at: nowIso }).eq("id", row.id);
        continue;
      }

      const { data: cfg } = await supabase
        .from("workspace_booking_wa_templates")
        .select("enabled, template_id, language, variables_map")
        .eq("workspace_id", booking.workspace_id)
        .eq("type", row.type)
        .maybeSingle();

      if (!cfg || !cfg.enabled || !cfg.template_id) {
        await supabase.from("booking_wa_reminders").update({ status: "skipped", error_message: cfg ? "disabled or no template" : "no config", sent_at: nowIso }).eq("id", row.id);
        continue;
      }

      // Phone du lead/booking
      const phoneRaw = booking.phone || (booking.lead_id ? (await supabase.from("leads").select("phone").eq("id", booking.lead_id).maybeSingle()).data?.phone : null);
      const phone = normalizePhone(phoneRaw);
      if (!phone) {
        await supabase.from("booking_wa_reminders").update({ status: "skipped", error_message: "no phone", sent_at: nowIso }).eq("id", row.id);
        continue;
      }

      // Offer name (optional)
      let offerName = "";
      if (booking.offer_id) {
        const { data: o } = await supabase.from("offers").select("name").eq("id", booking.offer_id).maybeSingle();
        offerName = (o as any)?.name || "";
      }

      // Template Meta
      const { data: tpl } = await supabase.from("whatsapp_templates").select("name, language").eq("id", cfg.template_id).maybeSingle();
      if (!tpl) {
        await supabase.from("booking_wa_reminders").update({ status: "failed", error_message: "template missing", sent_at: nowIso }).eq("id", row.id);
        continue;
      }

      // WhatsApp config (workspace-scoped)
      const { data: waCfg } = await supabase
        .from("whatsapp_config")
        .select("phone_number_id, access_token, is_active")
        .eq("workspace_id", booking.workspace_id)
        .eq("is_active", true)
        .maybeSingle();
      if (!waCfg) {
        await supabase.from("booking_wa_reminders").update({ status: "failed", error_message: "WhatsApp non configuré", sent_at: nowIso }).eq("id", row.id);
        continue;
      }

      const { date: dateStr, time: timeStr } = fmtParis(booking.booking_date, booking.time_slot);
      const renderVars: Record<string, string> = {
        name: booking.name || "",
        date: dateStr,
        time: timeStr,
        offer_name: offerName,
        meet_url: booking.meet_link || "",
      };

      // variables_map: { "1": "{{name}}", "2": "{{date}}", ... }
      const vmap = (cfg.variables_map ?? {}) as Record<string, string>;
      const keys = Object.keys(vmap).sort((a, b) => Number(a) - Number(b));
      const variables = keys.map((k) => renderVar(vmap[k], renderVars));

      const payload: any = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: (tpl as any).name,
          language: { code: cfg.language || (tpl as any).language || "fr" },
          ...(variables.length > 0
            ? { components: [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: String(v) })) }] }
            : {}),
        },
      };

      const resp = await fetch(`${GRAPH}/${waCfg.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${waCfg.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();

      if (!resp.ok) {
        await supabase.from("booking_wa_reminders").update({ status: "failed", error_message: JSON.stringify(data).slice(0, 500), sent_at: nowIso }).eq("id", row.id);
        results.push({ id: row.id, status: "failed" });
        continue;
      }

      const waMsgId = data.messages?.[0]?.id || null;
      await supabase.from("whatsapp_messages").insert({
        lead_id: booking.lead_id,
        owner_id: booking.owner_id,
        workspace_id: booking.workspace_id,
        direction: "outbound",
        content: `[Template: ${(tpl as any).name}]${variables.length ? ` ${variables.join(" | ")}` : ""}`,
        message_type: "template",
        status: "sent",
        wa_message_id: waMsgId,
        metadata: { booking_id: booking.id, reminder_type: row.type, source: "booking_wa_reminders" },
      } as any);

      await supabase.from("booking_wa_reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ id: row.id, status: "sent" });
    } catch (e) {
      await supabase.from("booking_wa_reminders").update({ status: "failed", error_message: String(e).slice(0, 500), sent_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ id: row.id, status: "failed", error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
