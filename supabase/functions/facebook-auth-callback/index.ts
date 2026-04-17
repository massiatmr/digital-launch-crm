import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // user_id
  const errorParam = url.searchParams.get("error");

  const siteUrl = Deno.env.get("SITE_URL") || "https://digital-launch-crm.lovable.app";
  const redirectBase = `${siteUrl}/settings/integrations`;

  if (errorParam) {
    return Response.redirect(`${redirectBase}?fb=error&reason=${encodeURIComponent(errorParam)}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${redirectBase}?fb=error&reason=missing_params`, 302);
  }

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

    // 2. Exchange to long-lived user token
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const longJson = await longRes.json();
    const userToken = longJson.access_token || tokenJson.access_token;

    // 3. Fetch user's pages with their (long-lived) page tokens
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`,
    );
    const pagesJson = await pagesRes.json();
    const pages = pagesJson.data || [];

    // 4. Upsert into meta_pages with service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    for (const p of pages) {
      await supabase.from("meta_pages").upsert(
        {
          owner_id: state,
          page_id: p.id,
          page_name: p.name || "",
          page_access_token: p.access_token,
          is_active: true,
        } as any,
        { onConflict: "owner_id,page_id" },
      );
    }

    return Response.redirect(`${redirectBase}?fb=connected&count=${pages.length}`, 302);
  } catch (err) {
    console.error("[fb-callback]", err);
    return Response.redirect(`${redirectBase}?fb=error&reason=internal`, 302);
  }
});
