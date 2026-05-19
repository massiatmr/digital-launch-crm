// Edge function to debug Facebook leadgen webhook subscription
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const token = Deno.env.get('FB_PAGE_ACCESS_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ error: 'FB_PAGE_ACCESS_TOKEN not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const API = 'https://graph.facebook.com/v21.0';
    const result: Record<string, unknown> = {};

    // 1. Token debug - shows token type, scopes, app id, expiration
    const debugRes = await fetch(
      `${API}/debug_token?input_token=${token}&access_token=${token}`
    );
    result.token_debug = await debugRes.json();

    // 2. /me - identity behind the token (User or Page)
    const meRes = await fetch(`${API}/me?fields=id,name&access_token=${token}`);
    result.me = await meRes.json();

    // 3. /me/accounts - list of pages the user manages (only works with USER token)
    const accountsRes = await fetch(
      `${API}/me/accounts?fields=id,name,access_token,tasks&access_token=${token}`
    );
    const accountsJson = await accountsRes.json();
    // Strip access_token from each page before returning
    if (accountsJson?.data) {
      accountsJson.data = accountsJson.data.map((p: Record<string, unknown>) => {
        const { access_token: _omit, ...rest } = p;
        return { ...rest, has_page_token: Boolean(_omit) };
      });
    }
    result.me_accounts = accountsJson;

    // 4. If /me returned a page id directly (PAGE token), check its subscribed_apps
    const meData = result.me as { id?: string };
    if (meData?.id) {
      const subRes = await fetch(
        `${API}/${meData.id}/subscribed_apps?access_token=${token}`
      );
      result.subscribed_apps_for_me = await subRes.json();
    }

    // 5. For each page in /me/accounts, check its subscribed_apps using its own page token
    const accountsData = result.me_accounts as { data?: Array<{ id: string; name: string; access_token?: string }> };
    if (accountsData?.data?.length) {
      const subs: Array<Record<string, unknown>> = [];
      for (const page of accountsData.data) {
        const pageToken = page.access_token || token;
        const r = await fetch(
          `${API}/${page.id}/subscribed_apps?access_token=${pageToken}`
        );
        subs.push({
          page_id: page.id,
          page_name: page.name,
          has_page_token: Boolean(page.access_token),
          subscribed_apps: await r.json(),
        });
      }
      result.subscribed_apps_per_page = subs;
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
