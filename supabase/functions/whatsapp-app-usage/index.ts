// Returns the current Meta app's WhatsApp conversation usage (24h window)
// Read-only. Surfaces "X / 1000 conversations used today" for Dev-mode awareness.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_APP_ID = Deno.env.get("FB_APP_ID")!;
const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET")!;
const GRAPH = "https://graph.facebook.com/v21.0";

const DEV_LIMIT_24H = 1000; // Meta dev-mode soft limit

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const workspace_id = body.workspace_id as string | null;

    if (workspace_id) {
      const { data: isMember } = await admin.rpc("is_workspace_member", {
        _workspace_id: workspace_id,
        _user_id: user.id,
      });
      if (!isMember) return json({ error: "Not a member" }, 403);
    }

    // Pick any access_token from configs in this workspace to query WABA analytics
    const q = admin.from("whatsapp_config").select("access_token,business_account_id");
    const scoped = workspace_id ? q.eq("workspace_id", workspace_id) : q.eq("owner_id", user.id);
    const { data: cfgs } = await scoped;
    const cfg = (cfgs || [])[0];

    // App-level usage via app access token (always available)
    const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
    const now = Math.floor(Date.now() / 1000);
    const since = now - 24 * 60 * 60;

    // Try WABA-level conversation analytics first (more meaningful)
    let conversations = 0;
    let waba_count = 0;
    let mode: "waba" | "app" = "app";
    let raw: unknown = null;

    if (cfg?.business_account_id && cfg?.access_token) {
      mode = "waba";
      const url =
        `${GRAPH}/${cfg.business_account_id}?fields=conversation_analytics.start(${since}).end(${now}).granularity(DAILY).phone_numbers([]).dimensions(["CONVERSATION_CATEGORY"])`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${cfg.access_token}` } });
      raw = await r.json().catch(() => null);
      if (r.ok) {
        const points = (raw as any)?.conversation_analytics?.data?.[0]?.data_points || [];
        for (const p of points) conversations += Number(p?.conversation || 0);
      }
      // Count distinct WABAs in this workspace
      const { count } = await admin
        .from("whatsapp_config")
        .select("business_account_id", { count: "exact", head: true })
        .eq(workspace_id ? "workspace_id" : "owner_id", workspace_id ?? user.id);
      waba_count = count || 0;
    }

    return json({
      ok: true,
      mode,
      conversations,
      limit: DEV_LIMIT_24H,
      pct: Math.min(100, Math.round((conversations / DEV_LIMIT_24H) * 100)),
      waba_count,
      app_id: FB_APP_ID,
      app_token_available: !!appToken,
      raw,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
