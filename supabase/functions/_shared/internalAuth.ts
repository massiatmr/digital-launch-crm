// Verifies that a request comes from a trusted internal caller (cron / other functions)
// holding a real service-role key. The token's signature is verified by asking the
// Auth admin API, which only accepts genuine service-role keys. Never trust decoded
// JWT payloads alone.
const cache = new Map<string, number>();

export function bearerOf(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export async function isServiceRoleToken(token: string): Promise<boolean> {
  if (!token) return false;
  const envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (envKey && token === envKey) return true;
  const hit = cache.get(token);
  if (hit && hit > Date.now()) return true;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    await r.body?.cancel();
    if (r.ok) {
      cache.set(token, Date.now() + 10 * 60_000);
      return true;
    }
  } catch (_) { /* deny */ }
  return false;
}

export async function isServiceRoleRequest(req: Request): Promise<boolean> {
  return isServiceRoleToken(bearerOf(req));
}

export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function maskEmail(e: unknown): string {
  const s = String(e ?? "");
  const [u, d] = s.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}***@${d}`;
}

// ---- Signed OAuth state (HMAC-SHA256 with a server-only secret) ----
async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, t: Date.now() })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}
export async function verifyState(state: string, maxAgeMs = 30 * 60_000): Promise<Record<string, any> | null> {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body))));
  if (expected !== sig) return null;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4)));
    if (typeof json.t !== "number" || Date.now() - json.t > maxAgeMs) return null;
    return json;
  } catch { return null; }
}

export function isAllowedAppOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const site = Deno.env.get("SITE_URL");
    if (site && new URL(site).origin === u.origin) return true;
    if (u.hostname === "localhost") return true;
    if (u.protocol !== "https:") return false;
    return /(^|\.)lovable\.app$/.test(u.hostname) || /(^|\.)lovableproject\.com$/.test(u.hostname);
  } catch { return false; }
}
