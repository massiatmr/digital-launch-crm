// Public WhatsApp Cloud API webhook (no JWT)
// GET = handshake (verify_token lookup in DB)
// POST = inbound message → insert into whatsapp_messages + push notif owner
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token) return new Response("Forbidden", { status: 403 });
    const { data } = await admin
      .from("whatsapp_config")
      .select("id")
      .eq("verify_token", token)
      .maybeSingle();
    if (!data) return new Response("Forbidden", { status: 403 });
    return new Response(challenge ?? "", { status: 200 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;
        const phone_number_id = value.metadata?.phone_number_id;
        if (!phone_number_id) continue;

        const { data: cfg } = await admin
          .from("whatsapp_config")
          .select("owner_id, is_active, workspace_id")
          .eq("phone_number_id", phone_number_id)
          .maybeSingle();
        if (!cfg || !cfg.is_active) continue;

        for (const msg of value.messages) {
          const from = normalizePhone(msg.from);
          const content =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            `[${msg.type}]`;

          const tail = from.slice(-9);
          const { data: leads } = await admin
            .from("leads")
            .select("id, name")
            .eq("owner_id", cfg.owner_id)
            .ilike("phone", `%${tail}%`)
            .limit(1);
          const lead = leads?.[0];
          if (!lead) continue;

          await admin.from("whatsapp_messages").insert({
            lead_id: lead.id,
            owner_id: cfg.owner_id,
            direction: "inbound",
            content,
            wa_message_id: msg.id,
            sent_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
            status: "received",
          });

          // Push notif via OneSignal
          try {
            const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                user_id: cfg.owner_id,
                title: `💬 WhatsApp CRM — ${lead.name}`,
                body: content.slice(0, 140),
                url: `/conversations?lead=${lead.id}&highlight=1`,
                tag: `wa-${lead.id}`.slice(0, 32),
              }),
            });
            const txt = await pushRes.text();
            let pushJson: any = null;
            try {
              pushJson = JSON.parse(txt);
            } catch {
              pushJson = null;
            }
            if (pushRes.ok && pushJson?.ok !== false) {
              console.log(`OneSignal push for wa msg ${msg.id}: ${pushRes.status} ${txt}`);
            } else {
              console.error(`OneSignal push failed for wa msg ${msg.id}: ${pushRes.status} ${txt}`);
            }
          } catch (pushErr) {
            console.error("Push error:", pushErr);
          }
        }
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (e) {
    console.error("whatsapp-webhook error:", e);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
});
