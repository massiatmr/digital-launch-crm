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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function base64UrlToBytes(b64u: string): Uint8Array {
  const padding = "=".repeat((4 - (b64u.length % 4)) % 4);
  const base64 = (b64u + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeyPair(rawPrivateKey: string): Promise<CryptoKeyPair> {
  const privateBytes = base64UrlToBytes(rawPrivateKey);
  const publicBytes = p256.getPublicKey(privateBytes, false);
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: bytesToBase64Url(x), y: bytesToBase64Url(y), key_ops: ["verify"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"],
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: bytesToBase64Url(privateBytes), x: bytesToBase64Url(x), y: bytesToBase64Url(y), key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  return { publicKey, privateKey };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: only service role may invoke send-push.
  // All legitimate callers are server-side (edge functions, cron) using SERVICE_ROLE_KEY.
  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!authToken || authToken !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      user_id,
      title,
      body,
      url,
      tag,
      subscription_ids,
      device_ids,
      source,
    } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetIds = Array.isArray(subscription_ids)
      ? subscription_ids.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
      : [];
    const targetDeviceIds = Array.isArray(device_ids)
      ? device_ids.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
      : [];

    const sourceLabel: string = typeof source === "string" && source.length > 0 ? source : "manual_test";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("push_subscriptions")
      .select("id, endpoint, keys_p256dh, keys_auth, device_info, device_label, device_id, status, created_at")
      .eq("user_id", user_id);

    if (targetIds.length > 0) query = query.in("id", targetIds);
    else if (targetDeviceIds.length > 0) query = query.in("device_id", targetDeviceIds);
    else query = query.eq("status", "active");

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    console.log("send-push request", {
      user_id,
      mode: targetIds.length > 0 ? "by-id" : targetDeviceIds.length > 0 ? "by-device" : "all-active",
      requested: targetIds.length || targetDeviceIds.length,
      found: subscriptions?.length ?? 0,
      source: sourceLabel,
    });

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({
        sent: 0, failed: 0, expired_cleaned: 0, results: [], debug: { found: 0 },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vapidKeys = await importVapidKeyPair(VAPID_PRIVATE_KEY);
    const subject = getNormalizedVapidSubject();
    const appServer = await ApplicationServer.new({ contactInformation: subject, vapidKeys });

    const titleStr = title || "🔔 Notification";
    const bodyStr = body || "";
    const payload = JSON.stringify({
      title: titleStr,
      body: bodyStr,
      icon: "https://digital-launch-crm.lovable.app/icon-192x192.png",
      badge: "https://digital-launch-crm.lovable.app/icon-192x192.png",
      url: url || "/",
      tag: tag || "notif",
    });

    const results: Array<Record<string, unknown>> = [];
    const expiredIds: string[] = [];
    const successIds: string[] = [];
    const failureUpdates: Array<{ id: string; error: string }> = [];
    const logRows: Array<Record<string, unknown>> = [];
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      const host = (() => { try { return new URL(sub.endpoint).host; } catch { return "unknown"; } })();
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        } satisfies PushSubscription);

        // Apple Push exige un Topic ≤32 chars, base64url-safe.
        // On hash le tag fourni (qui peut contenir un UUID = 39 chars) en court ID stable.
        let safeTopic: string | undefined = undefined;
        if (typeof tag === "string" && tag.length > 0) {
          if (/^[A-Za-z0-9_-]{1,32}$/.test(tag)) {
            safeTopic = tag;
          } else {
            const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tag));
            safeTopic = bytesToBase64Url(new Uint8Array(hashBuf)).slice(0, 32);
          }
        }

        await subscriber.pushTextMessage(payload, {
          ttl: 86400,
          urgency: Urgency.High,
          topic: safeTopic,
        });

        sent++;
        successIds.push(sub.id);
        results.push({ subId: sub.id, deviceLabel: sub.device_label, host, ok: true, status: 201 });
        logRows.push({
          user_id, subscription_id: sub.id, device_label: sub.device_label,
          source: sourceLabel, title: titleStr, body_preview: bodyStr.slice(0, 200),
          status: "sent", provider_status: 201,
        });
      } catch (err) {
        failed++;
        let status: number | null = null;
        let bodyText = "";
        let message = err instanceof Error ? err.message : String(err);

        if (err instanceof PushMessageError) {
          status = err.response.status;
          try { bodyText = (await err.response.text()).slice(0, 300); } catch { /* noop */ }
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
          } else {
            failureUpdates.push({ id: sub.id, error: `HTTP ${status}: ${bodyText || message}`.slice(0, 500) });
          }
        } else {
          failureUpdates.push({ id: sub.id, error: message.slice(0, 500) });
        }

        results.push({ subId: sub.id, deviceLabel: sub.device_label, host, ok: false, status, error: message, body: bodyText });
        logRows.push({
          user_id, subscription_id: sub.id, device_label: sub.device_label,
          source: sourceLabel, title: titleStr, body_preview: bodyStr.slice(0, 200),
          status: expiredIds.includes(sub.id) ? "expired" : "failed",
          provider_status: status, error_message: `${message}${bodyText ? ` | ${bodyText}` : ""}`.slice(0, 500),
        });
      }
    }

    // Side-effects: mark expired, update health, log everything.
    if (expiredIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ status: "invalid", last_failure_at: new Date().toISOString(), last_error: "Endpoint expired (404/410)" } as any)
        .in("id", expiredIds);
    }
    if (successIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), status: "active" } as any)
        .in("id", successIds);
    }
    for (const f of failureUpdates) {
      await supabase
        .from("push_subscriptions")
        .update({ last_failure_at: new Date().toISOString(), last_error: f.error } as any)
        .eq("id", f.id);
    }
    if (logRows.length > 0) {
      await supabase.from("push_delivery_logs").insert(logRows as any);
    }

    console.log("send-push result", { sent, failed, expired: expiredIds.length });

    return new Response(JSON.stringify({
      sent, failed, expired_cleaned: expiredIds.length, results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("send-push fatal:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
