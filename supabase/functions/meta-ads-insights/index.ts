import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_MIN = 30;

type CampaignRow = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number | null;
  page_id: string;
  page_name: string;
  ad_account_id: string | null;
};

type InsightRow = {
  campaign_id: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads_meta: number;
};

async function fbGet(url: string): Promise<any> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { _error: true, status: res.status, body: json };
  }
  return json;
}

async function fetchAdAccountsForUser(userToken: string): Promise<Array<{ id: string; account_id: string; currency?: string }>> {
  // Use the user-level token to list ad accounts the user has access to
  const data = await fbGet(
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,currency&limit=100&access_token=${userToken}`,
  );
  if (data?._error) return [];
  return Array.isArray(data?.data) ? data.data : [];
}

async function fetchCampaignsForAccount(adAccountId: string, token: string, includePaused: boolean, pageId: string): Promise<any[]> {
  const statuses = includePaused
    ? ["ACTIVE", "PAUSED"]
    : ["ACTIVE"];
  const filter = encodeURIComponent(JSON.stringify(statuses));
  // Filter by promoted_object.page_id so only campaigns promoting THIS page are returned.
  // This is the key isolation between FB pages sharing the same user token.
  const filtering = encodeURIComponent(JSON.stringify([
    { field: "promoted_object.page_id", operator: "EQUAL", value: pageId },
  ]));
  const url = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,promoted_object&effective_status=${filter}&filtering=${filtering}&limit=200&access_token=${token}`;
  const data = await fbGet(url);
  if (data?._error) {
    console.error("[meta-ads-insights] campaigns error", JSON.stringify(data.body));
    return [];
  }
  let rows = Array.isArray(data?.data) ? data.data : [];
  // Safety net: keep only campaigns whose promoted_object.page_id matches (filtering above can be ignored by Meta in rare cases)
  rows = rows.filter((c: any) => !c?.promoted_object?.page_id || String(c.promoted_object.page_id) === String(pageId));
  return rows;
}

async function fetchInsightsForAccount(
  adAccountId: string,
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, { spend: number; currency: string; impressions: number; clicks: number; leads_meta: number }>> {
  const timeRange = encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }));
  const url = `https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=campaign_id,spend,impressions,clicks,actions,account_currency&level=campaign&time_range=${timeRange}&limit=500&access_token=${token}`;
  const data = await fbGet(url);
  const map = new Map<string, { spend: number; currency: string; impressions: number; clicks: number; leads_meta: number }>();
  if (data?._error) {
    console.error("[meta-ads-insights] insights error", JSON.stringify(data.body));
    return map;
  }
  for (const row of data?.data ?? []) {
    const actions = Array.isArray(row?.actions) ? row.actions : [];
    let leads = 0;
    for (const a of actions) {
      if (a?.action_type === "lead" || a?.action_type === "leadgen.other" || a?.action_type === "onsite_conversion.lead_grouped") {
        leads += Number(a?.value ?? 0);
      }
    }
    map.set(String(row.campaign_id), {
      spend: Number(row.spend ?? 0),
      currency: String(row.account_currency ?? "EUR"),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      leads_meta: leads,
    });
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const workspace_id: string | null = body.workspace_id ?? null;
    const date_from: string = body.date_from; // YYYY-MM-DD
    const date_to: string = body.date_to;
    const include_paused: boolean = Boolean(body.include_paused);
    const force_refresh: boolean = Boolean(body.force_refresh);

    if (!date_from || !date_to) {
      return new Response(JSON.stringify({ error: "date_from and date_to required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (workspace_id) {
      const { data: isMember } = await admin.rpc("is_workspace_member", {
        _workspace_id: workspace_id,
        _user_id: user.id,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Load Meta pages for this workspace (or owner-only legacy)
    const pagesQuery = workspace_id
      ? admin.from("meta_pages").select("id, page_id, page_name, page_access_token, user_access_token, token_valid, owner_id, workspace_id").eq("workspace_id", workspace_id)
      : admin.from("meta_pages").select("id, page_id, page_name, page_access_token, user_access_token, token_valid, owner_id, workspace_id").eq("owner_id", user.id).is("workspace_id", null);

    const { data: pages } = await pagesQuery;
    if (!pages || pages.length === 0) {
      return new Response(JSON.stringify({ campaigns: [], pages: [], needs_reconnect: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const needsReconnect: string[] = [];
    const allCampaigns: CampaignRow[] = [];
    const insightsByCampaign = new Map<string, InsightRow>();

    // Cache check (per workspace + period)
    let useCache = false;
    if (!force_refresh) {
      const { data: cached } = await admin
        .from("meta_campaigns_cache")
        .select("fetched_at")
        .eq(workspace_id ? "workspace_id" : "owner_id", workspace_id ?? user.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.fetched_at) {
        const ageMin = (Date.now() - new Date(cached.fetched_at).getTime()) / 60000;
        useCache = ageMin < CACHE_TTL_MIN;
      }
    }

    // Ad accounts are cached per user-token (a user-token returns the same list of ad accounts
    // regardless of which page we ask for). But campaign listing IS scoped per page below.
    const adAccountsByToken = new Map<string, Array<{ id: string; account_id: string; currency?: string }>>();

    // Process each page individually so campaigns are scoped to that page's promoted_object.page_id
    for (const page of pages) {
      if (!page.token_valid) {
        needsReconnect.push(page.page_name || page.page_id);
        continue;
      }

      const userTok: string | null = page.user_access_token || null;
      if (!userTok) {
        if (!needsReconnect.includes(page.page_name || page.page_id)) {
          needsReconnect.push(page.page_name || page.page_id);
        }
        continue;
      }

      let accounts = adAccountsByToken.get(userTok);
      if (!accounts && !useCache) {
        accounts = await fetchAdAccountsForUser(userTok);
        adAccountsByToken.set(userTok, accounts);
        if (accounts.length === 0) {
          console.warn("[meta-ads-insights] no ad accounts returned for page", page.page_id);
        }
      }
      accounts = accounts ?? [];

      for (const account of accounts) {
        const campaigns = await fetchCampaignsForAccount(account.id, userTok, include_paused, page.page_id);
        if (campaigns.length === 0) continue;
        const insights = await fetchInsightsForAccount(account.id, userTok, date_from, date_to);

        for (const c of campaigns) {
          allCampaigns.push({
            campaign_id: String(c.id),
            campaign_name: c.name ?? "(sans nom)",
            status: c.status ?? "UNKNOWN",
            effective_status: c.effective_status ?? null,
            objective: c.objective ?? null,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            page_id: page.page_id,
            page_name: page.page_name || page.page_id,
            ad_account_id: account.id,
          });

          await admin.from("meta_campaigns_cache").upsert({
            workspace_id: page.workspace_id,
            owner_id: page.owner_id,
            page_id: page.page_id,
            ad_account_id: account.id,
            campaign_id: String(c.id),
            campaign_name: c.name ?? "(sans nom)",
            status: c.status ?? "UNKNOWN",
            effective_status: c.effective_status ?? null,
            objective: c.objective ?? null,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            fetched_at: new Date().toISOString(),
          } as any, { onConflict: "workspace_id,campaign_id" });

          const ins = insights.get(String(c.id));
          if (ins) {
            insightsByCampaign.set(String(c.id), { campaign_id: String(c.id), ...ins });
            await admin.from("meta_campaign_insights_cache").upsert({
              workspace_id: page.workspace_id,
              owner_id: page.owner_id,
              campaign_id: String(c.id),
              date_from,
              date_to,
              spend: ins.spend,
              currency: ins.currency,
              impressions: ins.impressions,
              clicks: ins.clicks,
              leads_meta: ins.leads_meta,
              fetched_at: new Date().toISOString(),
            } as any, { onConflict: "workspace_id,campaign_id,date_from,date_to" });
          }
        }
      }
    }
    }

    // If we used cache (no live fetch), rebuild from DB
    if (useCache && allCampaigns.length === 0) {
      const cacheQuery = workspace_id
        ? admin.from("meta_campaigns_cache").select("*").eq("workspace_id", workspace_id)
        : admin.from("meta_campaigns_cache").select("*").eq("owner_id", user.id).is("workspace_id", null);
      const statusFilter = include_paused ? ["ACTIVE", "PAUSED"] : ["ACTIVE"];
      const { data: cachedCamps } = await cacheQuery.in("status", statusFilter);
      const pageNameById = new Map(pages.map((p) => [p.page_id, p.page_name || p.page_id]));
      for (const c of cachedCamps ?? []) {
        allCampaigns.push({
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          status: c.status,
          effective_status: c.effective_status,
          objective: c.objective,
          daily_budget: c.daily_budget,
          page_id: c.page_id,
          page_name: pageNameById.get(c.page_id) || c.page_id,
          ad_account_id: c.ad_account_id,
        });
      }
      const insightsCacheQ = workspace_id
        ? admin.from("meta_campaign_insights_cache").select("*").eq("workspace_id", workspace_id).eq("date_from", date_from).eq("date_to", date_to)
        : admin.from("meta_campaign_insights_cache").select("*").eq("owner_id", user.id).is("workspace_id", null).eq("date_from", date_from).eq("date_to", date_to);
      const { data: cachedInsights } = await insightsCacheQ;
      for (const i of cachedInsights ?? []) {
        insightsByCampaign.set(i.campaign_id, {
          campaign_id: i.campaign_id,
          spend: Number(i.spend),
          currency: i.currency || "EUR",
          impressions: i.impressions,
          clicks: i.clicks,
          leads_meta: i.leads_meta,
        });
      }
    }

    // CRM leads count by campaign in the period
    const leadsQ = workspace_id
      ? admin.from("leads").select("meta_campaign_id").eq("workspace_id", workspace_id)
      : admin.from("leads").select("meta_campaign_id").eq("owner_id", user.id).is("workspace_id", null);
    const { data: leadsRows } = await leadsQ
      .not("meta_campaign_id", "is", null)
      .gte("created_at", `${date_from}T00:00:00Z`)
      .lte("created_at", `${date_to}T23:59:59Z`);

    const crmLeadsByCampaign = new Map<string, number>();
    for (const r of leadsRows ?? []) {
      if (!r.meta_campaign_id) continue;
      crmLeadsByCampaign.set(r.meta_campaign_id, (crmLeadsByCampaign.get(r.meta_campaign_id) ?? 0) + 1);
    }

    const result = allCampaigns.map((c) => {
      const ins = insightsByCampaign.get(c.campaign_id);
      const spend = ins?.spend ?? 0;
      const leads_crm = crmLeadsByCampaign.get(c.campaign_id) ?? 0;
      const leads_meta = ins?.leads_meta ?? 0;
      const cpl_crm = leads_crm > 0 ? spend / leads_crm : null;
      const cpl_meta = leads_meta > 0 ? spend / leads_meta : null;
      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        status: c.status,
        effective_status: c.effective_status,
        objective: c.objective,
        page_name: c.page_name,
        spend,
        currency: ins?.currency ?? "EUR",
        impressions: ins?.impressions ?? 0,
        clicks: ins?.clicks ?? 0,
        leads_crm,
        leads_meta,
        cpl_crm,
        cpl_meta,
      };
    });

    // Dedupe (a campaign may appear multiple times if returned by several pages/accounts)
    const dedup = new Map<string, typeof result[number]>();
    for (const r of result) {
      const existing = dedup.get(r.campaign_id);
      if (!existing || r.spend > existing.spend) dedup.set(r.campaign_id, r);
    }

    return new Response(
      JSON.stringify({
        campaigns: Array.from(dedup.values()).sort((a, b) => b.spend - a.spend),
        needs_reconnect: needsReconnect,
        from_cache: useCache,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[meta-ads-insights]", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
