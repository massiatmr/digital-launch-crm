// Sends push + email notification to the CRM owner when a new lead arrives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFY_EMAIL = "contact@digitallaunch-llc.com";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";

interface NotifyPayload {
  lead_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lead_id } = (await req.json()) as NotifyPayload;
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
    const sourceLabel = lead.source || "manual";
    const titleSuffix = lead.company_name ? ` (${lead.company_name})` : "";

    const results: Record<string, unknown> = {};

    // ---- 1) Push notification (to all devices of the lead owner)
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
      console.error("notify-new-lead: push failed", e);
      results.push = { error: e instanceof Error ? e.message : String(e) };
    }

    // ---- 2) Email notification (via transactional email infra)
    try {
      const emailRes = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "new-lead-notification",
          recipientEmail: NOTIFY_EMAIL,
          idempotencyKey: `new-lead-${lead.id}`,
          templateData: {
            leadName: lead.name,
            leadEmail: lead.email || "",
            leadPhone: lead.phone || "",
            leadCompany: lead.company_name || "",
            leadSource: lead.source,
            leadMessage: lead.message || "",
            leadUrl,
          },
        },
      });
      results.email = emailRes.data ?? { error: emailRes.error?.message };
    } catch (e) {
      console.error("notify-new-lead: email failed", e);
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
