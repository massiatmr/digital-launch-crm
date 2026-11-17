import { isAllowedAppOrigin } from "../_shared/internalAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const siteUrl = Deno.env.get("SITE_URL") || "https://digital-launch-crm.lovable.app";
  const redirectBase = `${siteUrl}/settings/integrations`;
  const parsedState = state ? parseState(state) : { userId: "", workspaceId: "", origin: "" };
  const resultBase = parsedState.origin ? `${parsedState.origin}/settings/integrations` : redirectBase;

  if (errorParam) {
    return oauthResult({ fb: "error", reason: errorParam }, resultBase);
  }
  if (!code || !state) {
    return oauthResult({ fb: "error", reason: "missing_params" }, resultBase);
  }

  const userId = parsedState.userId;
  const workspaceIdRaw = parsedState.workspaceId;
  const workspace_id = workspaceIdRaw && workspaceIdRaw.length > 0 ? workspaceIdRaw : null;

  try {
    const appId = Deno.env.get("FB_APP_ID")!;
    const appSecret = Deno.env.get("FB_APP_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/facebook-auth-callback`;
    const graphApi = "https://graph.facebook.com/v21.0";

    // 1. Exchange code -> long-lived user token
    const tokenRes = await fetch(
      `${graphApi}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      console.error("[fb-callback] token exchange failed", tokenJson);
      return oauthResult({ fb: "error", reason: "token_exchange" }, resultBase);
    }

    const longRes = await fetch(
      `${graphApi}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const longJson = await longRes.json();
    const userToken = longJson.access_token || tokenJson.access_token;

    // 2. Discover pages (no subscribe, no DB upsert)
    const pagesRes = await fetch(
      `${graphApi}/me/accounts?fields=id,name,access_token&access_token=${userToken}`,
    );
    const pagesJson = await pagesRes.json();
    const pages = (pagesJson.data || []) as Array<{ id: string; name: string; access_token: string }>;

    // 3. Discover ad accounts (no DB upsert). The picker will attach only the accounts
    // that belong to the current workspace, otherwise agency-level access mixes clients.
    const adAccountsRes = await fetch(
      `${graphApi}/me/adaccounts?fields=id,account_id,name,currency,business{id,name}&limit=200&access_token=${userToken}`,
    );
    const adAccountsJson = await adAccountsRes.json();
    const adAccounts = (adAccountsJson.data || []).map((a: any) => ({
      id: a.id,
      account_id: a.account_id || "",
      name: a.name || a.account_id || a.id,
      currency: a.currency || "",
      business_id: a.business?.id || null,
      business_name: a.business?.name || "",
    }));

    // 4. Discover WhatsApp numbers (no DB upsert)
    const waNumbers: Array<{
      phone_number_id: string;
      business_account_id: string;
      business_name: string;
      display_phone_number: string;
      verified_name: string;
    }> = [];
    const wabaSeen = new Set<string>();

    try {
      for (const bizType of ["", "?type=client_business"]) {
        const bizRes = await fetch(
          `${graphApi}/me/businesses${bizType}&fields=id,name&access_token=${userToken}`.replace("?&", "?"),
        );
        const bizJson = await bizRes.json();
        const businesses = bizJson.data || [];
        for (const biz of businesses) {
          for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
            const wabaRes = await fetch(
              `${graphApi}/${biz.id}/${edge}?fields=id,name&access_token=${userToken}`,
            );
            const wabaJson = await wabaRes.json();
            for (const waba of (wabaJson.data || [])) {
              if (wabaSeen.has(waba.id)) continue;
              wabaSeen.add(waba.id);
              const phonesRes = await fetch(
                `${graphApi}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${userToken}`,
              );
              const phonesJson = await phonesRes.json();
              for (const ph of phonesJson.data || []) {
                waNumbers.push({
                  phone_number_id: ph.id,
                  business_account_id: waba.id,
                  business_name: waba.name || "",
                  display_phone_number: ph.display_phone_number || "",
                  verified_name: ph.verified_name || waba.name || "",
                });
              }
            }
          }
        }
      }
    } catch (waErr) {
      console.error("[fb-callback] WA detection error", waErr);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 5. Stash everything in pending table; UI will let user pick
    const { data: pendingRow, error: pendingErr } = await supabase
      .from("meta_oauth_pending")
      .insert({
        owner_id: userId,
        workspace_id,
        user_token: userToken,
        pages,
        ad_accounts: adAccounts,
        wa_numbers: waNumbers,
      } as any)
      .select("id")
      .single();

    if (pendingErr || !pendingRow) {
      console.error("[fb-callback] failed to stash pending", pendingErr);
      return oauthResult({ fb: "error", reason: "stash_failed" }, resultBase);
    }

    // Cleanup older pending sessions for this user (>1h)
    await supabase
      .from("meta_oauth_pending")
      .delete()
      .lt("expires_at", new Date().toISOString());

    return oauthResult({
      fb: "pick",
      session: pendingRow.id,
      pages: String(pages.length),
      ads: String(adAccounts.length),
      wa: String(waNumbers.length),
    }, resultBase);
  } catch (err) {
    console.error("[fb-callback]", err);
    return oauthResult({ fb: "error", reason: "internal" }, resultBase);
  }
});

function parseState(state: string) {
  try {
    const base64 = state.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const parsed = JSON.parse(atob(padded));
    return {
      userId: String(parsed.u || ""),
      workspaceId: String(parsed.w || ""),
      origin: sanitizeOrigin(parsed.o),
    };
  } catch {
    const [userId, workspaceIdRaw] = state.split("|");
    return { userId, workspaceId: workspaceIdRaw || "", origin: "" };
  }
}

function sanitizeOrigin(origin?: string) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    return isAllowedAppOrigin(url.origin) ? url.origin : "";
  } catch {
    return "";
  }
}

function oauthResult(params: Record<string, string>, redirectBase: string) {
  // Redirect to a static HTML page hosted by the CRM. That page handles
  // postMessage + window.close back to the opener. Going through a real
  // static asset guarantees the browser renders the HTML (some edge runtimes
  // strip / override Content-Type, which caused the popup to show raw HTML).
  const origin = new URL(redirectBase).origin;
  const popupUrl = new URL(`${origin}/meta-oauth-popup.html`);
  for (const [key, value] of Object.entries(params)) popupUrl.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { Location: popupUrl.toString() },
  });
}
