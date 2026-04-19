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

  // Parse state: "user_id|workspace_id"
  const [userId, workspaceIdRaw] = state.split("|");
  const workspace_id = workspaceIdRaw && workspaceIdRaw.length > 0 ? workspaceIdRaw : null;

  try {
    const appId = Deno.env.get("FB_APP_ID")!;
    const appSecret = Deno.env.get("FB_APP_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/facebook-auth-callback`;

    // 1. Exchange code -> short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      console.error("[fb-callback] token exchange failed", tokenJson);
      return Response.redirect(`${redirectBase}?fb=error&reason=token_exchange`, 302);
    }

    // 2. Long-lived user token
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const longJson = await longRes.json();
    const userToken = longJson.access_token || tokenJson.access_token;

    // 3. Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`,
    );
    const pagesJson = await pagesRes.json();
    const pages = pagesJson.data || [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 4. Upsert pages per workspace (or legacy if no workspace)
    for (const p of pages) {
      const query = supabase.from("meta_pages").select("id").eq("page_id", p.id);
      const scoped = workspace_id
        ? query.eq("workspace_id", workspace_id)
        : query.eq("owner_id", userId).is("workspace_id", null);
      const { data: existing } = await scoped.maybeSingle();

      const payload = {
        owner_id: userId,
        workspace_id,
        page_id: p.id,
        page_name: p.name || "",
        page_access_token: p.access_token,
        is_active: true,
      };

      if (existing) {
        await supabase.from("meta_pages").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("meta_pages").insert(payload);
      }
    }

    // 5. Detect WhatsApp Business Accounts and phone numbers
    let waNumbersFound = 0;
    try {
      // Get businesses owned by user
      const bizRes = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${userToken}`,
      );
      const bizJson = await bizRes.json();
      const businesses = bizJson.data || [];

      for (const biz of businesses) {
        // Get owned WABAs for each business
        const wabaRes = await fetch(
          `https://graph.facebook.com/v21.0/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${userToken}`,
        );
        const wabaJson = await wabaRes.json();
        const wabas = wabaJson.data || [];

        for (const waba of wabas) {
          // Get phone numbers for each WABA
          const phonesRes = await fetch(
            `https://graph.facebook.com/v21.0/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${userToken}`,
          );
          const phonesJson = await phonesRes.json();
          const phones = phonesJson.data || [];

          for (const ph of phones) {
            waNumbersFound++;
            // Check if config already exists for this phone
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
              // Don't auto-activate; let user choose which number to activate
              is_active: existCfg?.is_active ?? false,
            };

            if (existCfg) {
              await supabase.from("whatsapp_config").update(waPayload).eq("id", existCfg.id);
            } else {
              await supabase.from("whatsapp_config").insert(waPayload);
            }
          }
        }
      }
    } catch (waErr) {
      console.error("[fb-callback] WA detection error", waErr);
    }

    return Response.redirect(
      `${redirectBase}?fb=connected&count=${pages.length}&wa=${waNumbersFound}`,
      302,
    );
  } catch (err) {
    console.error("[fb-callback]", err);
    return Response.redirect(`${redirectBase}?fb=error&reason=internal`, 302);
  }
});
