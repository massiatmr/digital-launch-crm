const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { p256 } from "https://esm.sh/@noble/curves@1.4.2/p256";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getVapidKeyPair() {
  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE_KEY);
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);

  return {
    privateKeyBytes,
    publicKeyBytes,
    publicKey: base64UrlEncode(publicKeyBytes),
  };
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const header = encoder.encode("Content-Encoding: ");
  const nul = new Uint8Array([0]);
  const p256Label = encoder.encode("P-256");
  const clientLen = new Uint8Array(2);
  clientLen[0] = 0;
  clientLen[1] = clientPublicKey.length;
  const serverLen = new Uint8Array(2);
  serverLen[0] = 0;
  serverLen[1] = serverPublicKey.length;
  return concatBuffers(header, typeBytes, nul, p256Label, nul, serverLen, serverPublicKey, clientLen, clientPublicKey);
}

async function hkdfExpand(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey("raw", salt as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm as BufferSource));
  const prkKey = await crypto.subtle.importKey("raw", prk as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concatBuffers(info, new Uint8Array([1]));
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter as BufferSource));
  return derived.slice(0, length);
}

async function encryptPayload(
  clientPublicKeyStr: string,
  clientAuthStr: string,
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKeyBytes: Uint8Array }> {
  const clientPublicKey = base64UrlDecode(clientPublicKeyStr);
  const clientAuth = base64UrlDecode(clientAuthStr);
  const payloadBytes = new TextEncoder().encode(payload);

  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPublicKey as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authEncoder = new TextEncoder();
  const authInfo = concatBuffers(authEncoder.encode("Content-Encoding: auth\0"));
  const ikm = await hkdfExpand(sharedSecret, clientAuth, authInfo, 32);

  const cekInfo = createInfo("aesgcm", clientPublicKey, serverPublicKeyBytes);
  const nonceInfo = createInfo("nonce", clientPublicKey, serverPublicKeyBytes);

  const contentEncryptionKey = await hkdfExpand(ikm, salt, cekInfo, 16);
  const nonce = await hkdfExpand(ikm, salt, nonceInfo, 12);

  const paddingLength = 0;
  const padded = new Uint8Array(2 + paddingLength + payloadBytes.length);
  padded[0] = (paddingLength >> 8) & 0xff;
  padded[1] = paddingLength & 0xff;
  padded.set(payloadBytes, 2 + paddingLength);

  const key = await crypto.subtle.importKey("raw", contentEncryptionKey as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, padded as BufferSource));

  return { ciphertext: encrypted, salt, serverPublicKeyBytes };
}

function getNormalizedVapidSubject(): string {
  if (!VAPID_SUBJECT) return "mailto:contact@digitallaunch-llc.com";
  if (VAPID_SUBJECT.startsWith("mailto:") || VAPID_SUBJECT.startsWith("https://")) return VAPID_SUBJECT;
  if (VAPID_SUBJECT.includes("@")) return `mailto:${VAPID_SUBJECT}`;
  return "mailto:contact@digitallaunch-llc.com";
}

async function createVapidAuthHeader(endpoint: string): Promise<{ jwt: string; publicKey: string; authorization: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const { privateKeyBytes, publicKeyBytes, publicKey } = getVapidKeyPair();
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiration, sub: getNormalizedVapidSubject() }))
  );
  const unsignedToken = `${header}.${body}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsignedToken) as BufferSource)
  );

  let rawSig: Uint8Array;
  if (signature.length === 64) {
    rawSig = signature;
  } else {
    let offset = 2;
    const rLen = signature[offset + 1];
    offset += 2;
    const r = signature.slice(offset, offset + rLen);
    offset += rLen;
    const sLen = signature[offset + 1];
    offset += 2;
    const s = signature.slice(offset, offset + sLen);
    const rPad = r.length > 32 ? r.slice(r.length - 32) : r;
    const sPad = s.length > 32 ? s.slice(s.length - 32) : s;
    rawSig = new Uint8Array(64);
    rawSig.set(rPad, 32 - rPad.length);
    rawSig.set(sPad, 64 - sPad.length);
  }

  const token = `${unsignedToken}.${base64UrlEncode(rawSig)}`;

  return {
    jwt: token,
    publicKey,
    authorization: `vapid t=${token}, k=${publicKey}`,
  };
}

async function sendPushToEndpoint(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  logs: string[]
): Promise<{ success: boolean; status: number; statusText: string; responseHeaders: Record<string, string> }> {
  logs.push(`[STEP 1] Endpoint host: ${new URL(endpoint).host}`);
  logs.push(`[STEP 2] p256dh length: ${p256dh.length}, auth length: ${auth.length}`);

  let ciphertext: Uint8Array, salt: Uint8Array, serverPublicKeyBytes: Uint8Array;
  try {
    const enc = await encryptPayload(p256dh, auth, payload);
    ciphertext = enc.ciphertext;
    salt = enc.salt;
    serverPublicKeyBytes = enc.serverPublicKeyBytes;
    logs.push(`[STEP 3] ✅ Encryption OK — ciphertext: ${ciphertext.length}b, salt: ${salt.length}b, serverPubKey: ${serverPublicKeyBytes.length}b`);
  } catch (e: any) {
    logs.push(`[STEP 3] ❌ Encryption FAILED: ${e.message}`);
    throw e;
  }

  let vapid;
  try {
    vapid = await createVapidAuthHeader(endpoint);
    logs.push(`[STEP 4] ✅ VAPID JWT signed — pubKey len: ${vapid.publicKey.length}, jwt parts: ${vapid.jwt.split('.').length}`);
    logs.push(`[STEP 4b] VAPID subject: ${getNormalizedVapidSubject()}`);
  } catch (e: any) {
    logs.push(`[STEP 4] ❌ VAPID signing FAILED: ${e.message}`);
    throw e;
  }

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aesgcm",
    Authorization: vapid.authorization,
    "Crypto-Key": `dh=${base64UrlEncode(serverPublicKeyBytes)}`,
    Encryption: `salt=${base64UrlEncode(salt)}`,
    TTL: "86400",
    Urgency: "high",
  };
  logs.push(`[STEP 5] Sending POST to push service...`);

  const response = await fetch(endpoint, { method: "POST", headers, body: ciphertext });
  const responseText = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });

  logs.push(`[STEP 6] ← Push service responded: ${response.status} ${response.statusText}`);
  if (responseText) logs.push(`[STEP 6b] Response body: ${responseText.slice(0, 500)}`);

  return { success: response.ok, status: response.status, statusText: responseText || response.statusText, responseHeaders };
}

// --- Main handler ---

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all push subscriptions for this user
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
      url: url || "/reminders",
      tag: tag || "reminder",
    });

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];
    const debugLogs: any[] = [];

    debugLogs.push({ global: `Found ${subscriptions.length} subscription(s)` });
    debugLogs.push({ env: {
      hasPrivateKey: !!VAPID_PRIVATE_KEY,
      privateKeyLen: VAPID_PRIVATE_KEY?.length || 0,
      hasSubject: !!VAPID_SUBJECT,
      subject: getNormalizedVapidSubject(),
    }});

    for (const sub of subscriptions) {
      const subLogs: string[] = [];
      try {
        const result = await sendPushToEndpoint(sub.endpoint, sub.keys_p256dh, sub.keys_auth, payload, subLogs);
        debugLogs.push({ subId: sub.id, status: result.status, body: result.statusText, headers: result.responseHeaders, logs: subLogs });
        if (result.success) {
          sent++;
        } else if (result.status === 404 || result.status === 410 || result.status === 403) {
          // 403 = VAPID key mismatch (subscription created with old keys) → unrecoverable, clean up
          expiredIds.push(sub.id);
          failed++;
        } else {
          console.error(`Push failed for ${sub.endpoint}: ${result.status} ${result.statusText}`);
          failed++;
        }
      } catch (e: any) {
        debugLogs.push({ subId: sub.id, exception: e.message, stack: e.stack, logs: subLogs });
        console.error(`Push error for ${sub.endpoint}:`, e);
        failed++;
      }
    }

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(JSON.stringify({ sent, failed, expired_cleaned: expiredIds.length, debug: debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
