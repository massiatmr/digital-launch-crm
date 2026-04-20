import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // "<user_id>|<workspace_id?>"
  const errorParam = url.searchParams.get("error");

  const siteUrl = Deno.env.get("SITE_URL") || "https://digital-launch-crm.lovable.app";
  const redirectBase = `${siteUrl}/settings/integrations`;

  if (errorParam) {
    return Response.redirect(`${redirectBase}?fb=error&reason=${encodeURIComponent(errorParam)}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${redirectBase}?fb=error&reason=missing_params`, 302);
  }

  const [userId, workspaceIdRaw] = state.split("|");
  const workspace_id = workspaceIdRaw && workspaceIdRaw.length > 0 ? workspaceIdRaw : null;

  try {
    const appId = Deno.env.get("FB_APP_ID")!;
    const appSecret = Deno.env.get("FB_APP_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/facebook-auth-callback`;
    const graphApi = "https://graph.facebook.com/v21.0";

    const subscribePage = async (pageId: string, pageToken: string) => {
      const subscribeRes = await fetch(
        `${graphApi}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${pageToken}`,
        { method: "POST" },
      );
      const subscribeJson = await subscribeRes.json().catch(() => ({}));

      const checkRes = await fetch(
        `${graphApi}/${pageId}/subscribed_apps?access_token=${pageToken}`,
      );
      const checkJson = await checkRes.json().catch(() => ({}));
      const apps = Array.isArray(checkJson?.data) ? checkJson.data : [];
      const isSubscribed = apps.some((entry: { id?: string }) => entry?.id === appId);

      return { isSubscribed, subscribeJson, checkJson };
    };

    const tokenRes = await fetch(
      `${graphApi}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      console.error("[fb-callback] token exchange failed", tokenJson);
      return Response.redirect(`${redirectBase}?fb=error&reason=token_exchange`, 302);
    }

    const longRes = await fetch(
      `${graphApi}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const longJson = await longRes.json();
    const userToken = longJson.access_token || tokenJson.access_token;

    const pagesRes = await fetch(
      `${graphApi}/me/accounts?fields=id,name,access_token&access_token=${userToken}`,
    );
    const pagesJson = await pagesRes.json();
    const pages = pagesJson.data || [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let subscribedPages = 0;

    for (const p of pages) {
      const query = supabase.from("meta_pages").select("id").eq("page_id", p.id);
      const scoped = workspace_id
        ? query.eq("workspace_id", workspace_id)
        : query.eq("owner_id", userId).is("workspace_id", null);
      const { data: existing } = await scoped.maybeSingle();

      let subscribed = false;
      try {
        const subscription = await subscribePage(p.id, p.access_token);
        subscribed = subscription.isSubscribed;
        console.log("[fb-callback] page subscription status", {
          pageId: p.id,
          pageName: p.name,
          subscribed,
          subscribeJson: subscription.subscribeJson,
          checkJson: subscription.checkJson,
        });
      } catch (subscriptionError) {
        console.error("[fb-callback] page subscription failed", {
          pageId: p.id,
          pageName: p.name,
          error: subscriptionError instanceof Error ? subscriptionError.message : String(subscriptionError),
        });
      }

      if (subscribed) subscribedPages++;

      const payload = {
        owner_id: userId,
        workspace_id,
        page_id: p.id,
        page_name: p.name || "",
        page_access_token: p.access_token,
        is_active: true,
        subscribed,
      };

      if (existing) {
        await supabase.from("meta_pages").update(payload as any).eq("id", existing.id);
      } else {
        await supabase.from("meta_pages").insert(payload as any);
      }
    }

    let waNumbersFound = 0;
    const wabaSeen = new Set<string>();
    const upsertPhones = async (waba: { id: string; name?: string }, phones: any[]) => {
      for (const ph of phones) {
        waNumbersFound++;
        const existQ = supabase
          .from("whatsapp_config")
          .select("id, is_active")
          .eq("phone_number_id", ph.id);
        const existScoped = workspace_id
          ? existQ.eq("workspace_id", workspace_id)
          : existQ.eq("owner_id", userId).is("workspace_id", null);
        const { data: existCfg } = await existScoped.maybeSingle();

        const waPayload = {
          owner_id: userId,
          workspace_id,
          phone_number_id: ph.id,
          business_account_id: waba.id,
          access_token: userToken,
          display_phone_number: ph.display_phone_number || "",
          verified_name: ph.verified_name || waba.name || "",
          is_active: existCfg?.is_active ?? false,
        };
        if (existCfg) {
          await supabase.from("whatsapp_config").update(waPayload).eq("id", existCfg.id);
        } else {
          await supabase.from("whatsapp_config").insert(waPayload);
        }
      }
    };

    const fetchWabaPhones = async (waba: { id: string; name?: string }) => {
      if (wabaSeen.has(waba.id)) return;
      wabaSeen.add(waba.id);
      const phonesRes = await fetch(
        `${graphApi}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${userToken}`,
      );
      const phonesJson = await phonesRes.json();
      console.log(`[fb-callback] WABA ${waba.id} (${waba.name}) phones:`, JSON.stringify(phonesJson));
      await upsertPhones(waba, phonesJson.data || []);
    };

    try {
      try {
        const debugRes = await fetch(
          `${graphApi}/debug_token?input_token=${userToken}&access_token=${Deno.env.get("FB_APP_ID")}|${Deno.env.get("FB_APP_SECRET")}`,
        );
        const debugJson = await debugRes.json();
        console.log("[fb-callback] token scopes:", JSON.stringify(debugJson?.data?.scopes));
      } catch (_) { /* ignore */ }

      for (const bizType of ["", "?type=client_business"]) {
        const bizRes = await fetch(
          `${graphApi}/me/businesses${bizType}&fields=id,name&access_token=${userToken}`.replace("?&", "?"),
        );
        const bizJson = await bizRes.json();
        console.log(`[fb-callback] businesses (${bizType || "owned"}):`, JSON.stringify(bizJson));
        const businesses = bizJson.data || [];

        for (const biz of businesses) {
          for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
            const wabaRes = await fetch(
              `${graphApi}/${biz.id}/${edge}?fields=id,name&access_token=${userToken}`,
            );
            const wabaJson = await wabaRes.json();
            console.log(`[fb-callback] biz ${biz.id} ${edge}:`, JSON.stringify(wabaJson));
            for (const waba of (wabaJson.data || [])) {
              await fetchWabaPhones(waba);
            }
          }
        }
      }
    } catch (waErr) {
      console.error("[fb-callback] WA detection error", waErr);
    }
    console.log(`[fb-callback] total WA numbers detected: ${waNumbersFound}`);

    return Response.redirect(
      `${redirectBase}?fb=connected&count=${pages.length}&subscribed=${subscribedPages}&wa=${waNumbersFound}`,
      302,
    );
  } catch (err) {
    console.error("[fb-callback]", err);
    return Response.redirect(`${redirectBase}?fb=error&reason=internal`, 302);
  }
});