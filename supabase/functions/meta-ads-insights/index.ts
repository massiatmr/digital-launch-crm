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

async function fetchCampaignsForAccount(adAccountId: string, token: string): Promise<any[]> {
  // Fetch ALL statuses — we filter for display later. This ensures campaigns
  // that are paused/archived but still generated leads or spend in the period
  // are visible.
  const url = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=500&access_token=${token}`;
  const data = await fbGet(url);
  if (data?._error) {
    console.error("[meta-ads-insights] campaigns error", JSON.stringify(data.body));
    return [];
  }
  return Array.isArray(data?.data) ? data.data : [];
}

async function fetchCampaignsByIds(ids: string[], token: string): Promise<any[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const out: any[] = [];
  for (const chunk of chunks) {
    const url = `https://graph.facebook.com/v21.0/?ids=${encodeURIComponent(chunk.join(","))}&fields=id,name,status,effective_status,objective,account_id&access_token=${token}`;
    const data = await fbGet(url);
    if (data?._error) continue;
    for (const k of Object.keys(data)) {
      if (data[k] && typeof data[k] === "object" && data[k].id) out.push(data[k]);
    }
  }
  return out;
}

function addPageId(target: Set<string>, value: unknown) {
  if (value === null || value === undefined) return;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) target.add(str);
}

function pageIdsFromCreative(creative: any): Set<string> {
  const ids = new Set<string>();
  const spec = creative?.object_story_spec ?? {};
  addPageId(ids, spec?.page_id);
  addPageId(ids, spec?.link_data?.page_id);
  addPageId(ids, spec?.video_data?.page_id);
  const storyId = creative?.effective_object_story_id;
  if (typeof storyId === "string" && storyId.includes("_")) {
    addPageId(ids, storyId.split("_")[0]);
  }
  return ids;
}

async function fetchCampaignPageMap(adAccountId: string, token: string): Promise<Map<string, Set<string>>> {
  const byCampaign = new Map<string, Set<string>>();
  const ensure = (campaignId: unknown) => {
    const key = String(campaignId ?? "");
    if (!key) return null;
    if (!byCampaign.has(key)) byCampaign.set(key, new Set<string>());
    return byCampaign.get(key)!;
  };

  const adsets = await fbGet(
    `https://graph.facebook.com/v21.0/${adAccountId}/adsets?fields=id,campaign_id,promoted_object&limit=500&access_token=${token}`,
  );
  if (adsets?._error) {
    console.warn("[meta-ads-insights] adsets page-map error", JSON.stringify(adsets.body));
  } else {
    for (const row of adsets?.data ?? []) {
      const pages = ensure(row?.campaign_id);
      if (pages) addPageId(pages, row?.promoted_object?.page_id);
    }
  }

  const ads = await fbGet(
    `https://graph.facebook.com/v21.0/${adAccountId}/ads?fields=id,campaign_id,creative{id,effective_object_story_id,object_story_spec}&limit=500&access_token=${token}`,
  );
  if (ads?._error) {
    console.warn("[meta-ads-insights] ads page-map error", JSON.stringify(ads.body));
  } else {
    for (const row of ads?.data ?? []) {
      const pages = ensure(row?.campaign_id);
      if (!pages) continue;
      for (const pageId of pageIdsFromCreative(row?.creative)) pages.add(pageId);
    }
  }

  return byCampaign;
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

    const adAccountQuery = workspace_id
      ? admin.from("meta_ad_accounts").select("ad_account_id").eq("workspace_id", workspace_id).eq("is_active", true)
      : admin.from("meta_ad_accounts").select("ad_account_id").eq("owner_id", user.id).is("workspace_id", null).eq("is_active", true);
    const { data: scopedAdAccounts } = await adAccountQuery;
    const scopedAdAccountIds = new Set((scopedAdAccounts ?? []).map((a: any) => String(a.ad_account_id)));

    const needsReconnect: string[] = [];
    const allCampaigns: CampaignRow[] = [];
    const insightsByCampaign = new Map<string, InsightRow>();

    // Cache check (per workspace + EXACT period). We must key on the requested
    // date range — otherwise switching periods reuses stale insights from a
    // different range and shows 0 spend / 0 leads.
    let useCache = false;
    if (!force_refresh) {
      const insightsCacheQ = workspace_id
        ? admin.from("meta_campaign_insights_cache").select("fetched_at").eq("workspace_id", workspace_id).eq("date_from", date_from).eq("date_to", date_to)
        : admin.from("meta_campaign_insights_cache").select("fetched_at").eq("owner_id", user.id).is("workspace_id", null).eq("date_from", date_from).eq("date_to", date_to);
      const { data: cached } = await insightsCacheQ
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.fetched_at) {
        const ageMin = (Date.now() - new Date(cached.fetched_at).getTime()) / 60000;
        useCache = ageMin < CACHE_TTL_MIN;
      }
    }

    const scopeCol = workspace_id ? "workspace_id" : "owner_id";
    const scopeVal = workspace_id ?? user.id;
    if (!useCache) {
      await admin.from("meta_campaigns_cache").delete().eq(scopeCol, scopeVal);
      await admin.from("meta_campaign_insights_cache").delete().eq(scopeCol, scopeVal).eq("date_from", date_from).eq("date_to", date_to);
    }

    // Ad accounts are cached per user-token (a user-token returns the same list of ad accounts
    // regardless of which page we ask for). But campaign listing IS scoped per page below.
    const adAccountsByToken = new Map<string, Array<{ id: string; account_id: string; currency?: string }>>();
    const campaignPagesByAccount = new Map<string, Map<string, Set<string>>>();

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
      const allowedAccounts = scopedAdAccountIds.size > 0
        ? accounts.filter((account) => scopedAdAccountIds.has(String(account.id)))
        : accounts;

      // If user explicitly picked ad accounts for this workspace, trust that scope
      // and don't apply the page_id sub-filter (older campaigns may not expose
      // promoted_object.page_id and would be wrongly excluded).
      const skipPageFilter = scopedAdAccountIds.size > 0;

      for (const account of allowedAccounts) {
        const campaigns = await fetchCampaignsForAccount(account.id, userTok);
        if (campaigns.length === 0) continue;

        let scopedCampaigns = campaigns;
        if (!skipPageFilter) {
          let pageMap = campaignPagesByAccount.get(account.id);
          if (!pageMap) {
            pageMap = await fetchCampaignPageMap(account.id, userTok);
            campaignPagesByAccount.set(account.id, pageMap);
          }
          scopedCampaigns = campaigns.filter((c: any) => pageMap?.get(String(c.id))?.has(String(page.page_id)));
        }
        if (scopedCampaigns.length === 0) continue;
        const insights = await fetchInsightsForAccount(account.id, userTok, date_from, date_to);

        for (const c of scopedCampaigns) {
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

    // If we used cache (no live fetch), rebuild from DB
    if (useCache && allCampaigns.length === 0) {
      const cacheQuery = workspace_id
        ? admin.from("meta_campaigns_cache").select("*").eq("workspace_id", workspace_id)
        : admin.from("meta_campaigns_cache").select("*").eq("owner_id", user.id).is("workspace_id", null);
      const { data: cachedCamps } = await cacheQuery;
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

    // Surface CRM-tagged campaigns that weren't returned by the campaign listing
    // (e.g. campaign was deleted, or belongs to an ad account not in scope).
    const knownIds = new Set(allCampaigns.map((c) => c.campaign_id));
    const orphanIds = Array.from(crmLeadsByCampaign.keys()).filter((id) => !knownIds.has(id));
    if (orphanIds.length > 0) {
      // Use any available user token to resolve metadata
      const anyToken = Array.from(adAccountsByToken.keys())[0]
        ?? (pages.find((p) => p.user_access_token)?.user_access_token ?? null);
      if (anyToken) {
        const metas = await fetchCampaignsByIds(orphanIds, anyToken);
        const firstPageName = pages[0]?.page_name || pages[0]?.page_id || "";

        // Fetch insights for the ad accounts referenced by the orphan campaigns
        // so spend/leads_meta are populated even when those accounts weren't
        // explicitly scoped via meta_ad_accounts.
        const orphanAccountIds = new Set<string>();
        for (const m of metas) {
          if (m.account_id) orphanAccountIds.add(`act_${m.account_id}`);
        }
        for (const acctId of orphanAccountIds) {
          try {
            const insights = await fetchInsightsForAccount(acctId, anyToken, date_from, date_to);
            for (const [cid, ins] of insights) {
              if (!insightsByCampaign.has(cid)) {
                insightsByCampaign.set(cid, { campaign_id: cid, ...ins });
                const ownerPage = pages[0];
                await admin.from("meta_campaign_insights_cache").upsert({
                  workspace_id: ownerPage?.workspace_id,
                  owner_id: ownerPage?.owner_id,
                  campaign_id: cid,
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
          } catch (e) {
            console.warn("[meta-ads-insights] orphan insights error", acctId, e);
          }
        }

        for (const m of metas) {
          allCampaigns.push({
            campaign_id: String(m.id),
            campaign_name: m.name ?? "(sans nom)",
            status: m.status ?? "UNKNOWN",
            effective_status: m.effective_status ?? null,
            objective: m.objective ?? null,
            daily_budget: null,
            page_id: pages[0]?.page_id ?? "",
            page_name: firstPageName,
            ad_account_id: m.account_id ? `act_${m.account_id}` : null,
          });
        }
        const resolvedIds = new Set(metas.map((m: any) => String(m.id)));
        for (const id of orphanIds) {
          if (resolvedIds.has(id)) continue;
          allCampaigns.push({
            campaign_id: id,
            campaign_name: `Campagne ${id}`,
            status: "UNKNOWN",
            effective_status: null,
            objective: null,
            daily_budget: null,
            page_id: pages[0]?.page_id ?? "",
            page_name: firstPageName,
            ad_account_id: null,
          });
        }
      }
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

    // Dedupe (same campaign may appear from multiple pages/accounts)
    const dedup = new Map<string, typeof result[number]>();
    for (const r of result) {
      const existing = dedup.get(r.campaign_id);
      // Prefer the row with most signal: spend, then leads_crm
      if (!existing
        || r.spend > existing.spend
        || (r.spend === existing.spend && r.leads_crm > existing.leads_crm)) {
        dedup.set(r.campaign_id, r);
      }
    }

    // Display filter: keep ACTIVE; or anything with activity in the period;
    // include paused/archived only when user opted-in OR they had activity.
    const visible = Array.from(dedup.values()).filter((r) => {
      if (r.leads_crm > 0 || r.spend > 0 || r.leads_meta > 0) return true;
      if (include_paused) return true;
      return r.status === "ACTIVE";
    });

    return new Response(
      JSON.stringify({
        campaigns: visible.sort((a, b) => (b.spend + b.leads_crm) - (a.spend + a.leads_crm)),
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
