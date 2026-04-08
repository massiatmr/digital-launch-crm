import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Web Push crypto utilities (RFC 8291 / RFC 8188) ---
// We use the Web Crypto API available in Deno to implement VAPID + payload encryption.

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
  // "Content-Encoding: <type>\0" + "P-256\0\0A" + clientPubKey + "\0A" + serverPubKey
  const header = encoder.encode("Content-Encoding: ");
  const nul = new Uint8Array([0]);
  const p256 = encoder.encode("P-256");
  const clientLen = new Uint8Array(2);
  clientLen[0] = 0;
  clientLen[1] = clientPublicKey.length;
  const serverLen = new Uint8Array(2);
  serverLen[0] = 0;
  serverLen[1] = serverPublicKey.length;
  return concatBuffers(header, typeBytes, nul, p256, nul, serverLen, serverPublicKey, clientLen, clientPublicKey);
}

async function hkdfExpand(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concatBuffers(info, new Uint8Array([1]));
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
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

  // Generate server ECDH key pair
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));

  // Import client public key
  const clientKey = await crypto.subtle.importKey("raw", clientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256)
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for auth info
  const authEncoder = new TextEncoder();
  const authInfo = concatBuffers(authEncoder.encode("Content-Encoding: auth\0"));
  const ikm = await hkdfExpand(sharedSecret, clientAuth, authInfo, 32);

  // Derive content encryption key and nonce
  const cekInfo = createInfo("aesgcm", clientPublicKey, serverPublicKeyBytes);
  const nonceInfo = createInfo("nonce", clientPublicKey, serverPublicKeyBytes);

  const contentEncryptionKey = await hkdfExpand(ikm, salt, cekInfo, 16);
  const nonce = await hkdfExpand(ikm, salt, nonceInfo, 12);

  // Pad payload (2 bytes padding length + padding)
  const paddingLength = 0;
  const padded = new Uint8Array(2 + paddingLength + payloadBytes.length);
  padded[0] = (paddingLength >> 8) & 0xff;
  padded[1] = paddingLength & 0xff;
  padded.set(payloadBytes, 2 + paddingLength);

  // AES-GCM encrypt
  const key = await crypto.subtle.importKey("raw", contentEncryptionKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, padded));

  return { ciphertext: encrypted, salt, serverPublicKeyBytes };
}

async function createVapidAuthHeader(endpoint: string): Promise<{ authorization: string; cryptoKey: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  // Decode VAPID private key
  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE_KEY);
  const publicKeyBytes = base64UrlDecode(VAPID_PUBLIC_KEY);

  // Import private key for signing
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  // Create JWT
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiration, sub: VAPID_SUBJECT }))
  );
  const unsignedToken = `${header}.${body}`;

  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsignedToken))
  );

  // Convert DER signature to raw r||s (64 bytes)
  let rawSig: Uint8Array;
  if (signature.length === 64) {
    rawSig = signature;
  } else {
    // DER decode
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
    authorization: `vapid t=${token}, k=${base64UrlEncode(publicKeyBytes)}`,
    cryptoKey: `p256ecdsa=${base64UrlEncode(publicKeyBytes)}`,
  };
}

async function sendPushToEndpoint(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<{ success: boolean; status: number; statusText: string }> {
  const { ciphertext, salt, serverPublicKeyBytes } = await encryptPayload(p256dh, auth, payload);
  const vapid = await createVapidAuthHeader(endpoint);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      Authorization: vapid.authorization,
      "Crypto-Key": `${vapid.cryptoKey};dh=${base64UrlEncode(serverPublicKeyBytes)}`,
      Encryption: `salt=${base64UrlEncode(salt)}`,
      TTL: "86400",
      Urgency: "high",
    },
    body: ciphertext,
  });

  const responseText = await response.text();
  return { success: response.ok, status: response.status, statusText: responseText || response.statusText };
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
      url: url || "/reminders",
      tag: tag || "reminder",
    });

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        const result = await sendPushToEndpoint(sub.endpoint, sub.keys_p256dh, sub.keys_auth, payload);
        if (result.success) {
          sent++;
        } else if (result.status === 404 || result.status === 410) {
          // Subscription expired, clean up
          expiredIds.push(sub.id);
          failed++;
        } else {
          console.error(`Push failed for ${sub.endpoint}: ${result.status} ${result.statusText}`);
          failed++;
        }
      } catch (e) {
        console.error(`Push error for ${sub.endpoint}:`, e);
        failed++;
      }
    }

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(JSON.stringify({ sent, failed, expired_cleaned: expiredIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
