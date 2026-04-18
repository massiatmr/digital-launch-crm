import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import {
  ApplicationServer,
  PushMessageError,
  type PushSubscription,
  Urgency,
} from "jsr:@negrel/webpush@0.5.0";
import { p256 } from "https://esm.sh/@noble/curves@1.4.2/p256";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT_RAW = Deno.env.get("VAPID_SUBJECT") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getNormalizedVapidSubject(): string {
  if (!VAPID_SUBJECT_RAW) return "mailto:contact@digitallaunch-llc.com";
  if (VAPID_SUBJECT_RAW.startsWith("mailto:") || VAPID_SUBJECT_RAW.startsWith("https://")) return VAPID_SUBJECT_RAW;
  if (VAPID_SUBJECT_RAW.includes("@")) return `mailto:${VAPID_SUBJECT_RAW}`;
  return "mailto:contact@digitallaunch-llc.com";
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeyPairFromRawPrivateKey(rawPrivateKey: string): Promise<CryptoKeyPair> {
  const privateBytes = base64UrlToBytes(rawPrivateKey);
  const publicBytes = p256.getPublicKey(privateBytes, false);
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(x),
      y: bytesToBase64Url(y),
      key_ops: ["verify"],
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: bytesToBase64Url(privateBytes),
      x: bytesToBase64Url(x),
      y: bytesToBase64Url(y),
      key_ops: ["sign"],
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  return { publicKey, privateKey };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, tag, subscription_ids } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetIds = Array.isArray(subscription_ids)
      ? subscription_ids.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];

    const vapidKeys = await importVapidKeyPairFromRawPrivateKey(VAPID_PRIVATE_KEY);
    const subject = getNormalizedVapidSubject();
    const appServer = await ApplicationServer.new({
      contactInformation: subject,
      vapidKeys,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let query = supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth, id, device_info, created_at")
      .eq("user_id", user_id);

    if (targetIds.length > 0) {
      query = query.in("id", targetIds);
    }

    const { data: subscriptions, error } = await query;

    if (error) throw error;
    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, expired_cleaned: 0, debug: [] }), {
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
    const debugLogs: Array<Record<string, unknown>> = [
      {
        global: `Found ${subscriptions.length} subscription(s)`,
        targeted: targetIds.length > 0,
        requestedTargets: targetIds.length,
        mode: "aes128gcm (RFC 8291 via @negrel/webpush)",
        vapidSubject: subject,
      },
    ];

    for (const sub of subscriptions) {
      const host = new URL(sub.endpoint).host;
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        } satisfies PushSubscription);

        await subscriber.pushTextMessage(payload, {
          ttl: 86400,
          urgency: Urgency.High,
          topic: typeof tag === "string" && tag.length > 0 ? tag : undefined,
        });

        debugLogs.push({
          subId: sub.id,
          host,
          device: sub.device_info,
          created_at: sub.created_at,
          ok: true,
          status: 201,
        });
        sent++;
      } catch (error) {
        if (error instanceof PushMessageError) {
          const status = error.response.status;
          const responseBody = await error.response.text();
          debugLogs.push({
            subId: sub.id,
            host,
            device: sub.device_info,
            created_at: sub.created_at,
            status,
            error: error.toString(),
            body: responseBody.slice(0, 300),
            ok: false,
          });
          if (status === 403 || status === 404 || status === 410) {
            expiredIds.push(sub.id);
          }
        } else {
          debugLogs.push({
            subId: sub.id,
            host,
            device: sub.device_info,
            created_at: sub.created_at,
            error: error instanceof Error ? error.message : String(error),
            ok: false,
          });
        }
        failed++;
      }
    }

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(JSON.stringify({ sent, failed, expired_cleaned: expiredIds.length, debug: debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-push error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
