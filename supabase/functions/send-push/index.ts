// send-push : utilise la lib web-push (RFC 8291 aes128gcm) pour fiabilité maximale
// même quand l'app est fermée sur mobile et desktop.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno&deno-std=0.177.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_SUBJECT_RAW = Deno.env.get("VAPID_SUBJECT") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getNormalizedVapidSubject(): string {
  if (!VAPID_SUBJECT_RAW) return "mailto:contact@digitallaunch-llc.com";
  if (VAPID_SUBJECT_RAW.startsWith("mailto:") || VAPID_SUBJECT_RAW.startsWith("https://")) return VAPID_SUBJECT_RAW;
  if (VAPID_SUBJECT_RAW.includes("@")) return `mailto:${VAPID_SUBJECT_RAW}`;
  return "mailto:contact@digitallaunch-llc.com";
}

// Derive public key from private key if missing/mismatched
async function ensureVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
  }
  // Fallback: derive public from private
  const { p256 } = await import("https://esm.sh/@noble/curves@1.4.2/p256");
  const padding = "=".repeat((4 - (VAPID_PRIVATE_KEY.length % 4)) % 4);
  const base64 = (VAPID_PRIVATE_KEY + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const privBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) privBytes[i] = bin.charCodeAt(i);
  const pubBytes = p256.getPublicKey(privBytes, false);
  let binPub = "";
  for (const b of pubBytes) binPub += String.fromCharCode(b);
  const pubKey = btoa(binPub).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { publicKey: pubKey, privateKey: VAPID_PRIVATE_KEY };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, tag } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { publicKey, privateKey } = await ensureVapidKeys();
    const subject = getNormalizedVapidSubject();
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth, id")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: title || "🔔 Rappel",
      body: body || "Vous avez un rappel en attente.",
      icon: "https://digital-launch-crm.lovable.app/icon-192x192.png",
      badge: "https://digital-launch-crm.lovable.app/icon-192x192.png",
      url: url || "/reminders",
      tag: tag || "reminder",
    });

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];
    const debugLogs: any[] = [];

    debugLogs.push({
      global: `Found ${subscriptions.length} subscription(s)`,
      mode: "aes128gcm (RFC 8291 via web-push)",
      vapidSubject: subject,
      vapidPublicKeyLen: publicKey.length,
    });

    for (const sub of subscriptions) {
      try {
        const result = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          payload,
          { TTL: 86400, urgency: "high" }
        );
        debugLogs.push({
          subId: sub.id,
          host: new URL(sub.endpoint).host,
          status: result.statusCode,
          headers: result.headers,
          body: (result.body || "").toString().slice(0, 300),
          ok: true,
        });
        sent++;
      } catch (e: any) {
        const status = e?.statusCode;
        debugLogs.push({
          subId: sub.id,
          host: new URL(sub.endpoint).host,
          status,
          error: e?.message || String(e),
          body: (e?.body || "").toString().slice(0, 300),
          headers: e?.headers,
          ok: false,
        });
        if (status === 404 || status === 410 || status === 403) {
          expiredIds.push(sub.id);
        }
        failed++;
      }
    }

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(
      JSON.stringify({ sent, failed, expired_cleaned: expiredIds.length, debug: debugLogs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
