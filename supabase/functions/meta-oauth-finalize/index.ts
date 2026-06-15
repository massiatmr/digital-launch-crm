import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const graphApi = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const session_id = body.session_id as string;
    if (!session_id) return json({ error: "session_id required" }, 400);

    const { data: pending, error: pErr } = await admin
      .from("meta_oauth_pending")
      .select("*")
      .eq("id", session_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (pErr || !pending) return json({ error: "session_not_found" }, 404);

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await admin.from("meta_oauth_pending").delete().eq("id", session_id);
      return json({ error: "session_expired" }, 410);
    }

    const workspace_id: string | null = pending.workspace_id || null;
    const userToken: string = pending.user_token;

    // ------- LIST -------
    if (action === "list") {
      // Annotate which pages/numbers are already taken (in any workspace)
      const pageIds = (pending.pages || []).map((p: any) => p.id);
      const adAccountIds = (pending.ad_accounts || []).map((a: any) => a.id);
      const phoneIds = (pending.wa_numbers || []).map((p: any) => p.phone_number_id);

      const { data: takenPages } = pageIds.length
        ? await admin.from("meta_pages").select("page_id, workspace_id, owner_id").in("page_id", pageIds)
        : { data: [] as any[] };
      const { data: takenAds } = adAccountIds.length
        ? await admin.from("meta_ad_accounts").select("ad_account_id, workspace_id, owner_id").in("ad_account_id", adAccountIds)
        : { data: [] as any[] };
      const { data: takenWa } = phoneIds.length
        ? await admin.from("whatsapp_config").select("phone_number_id, workspace_id, owner_id").in("phone_number_id", phoneIds)
        : { data: [] as any[] };

      const pageStatus = (pid: string) => {
        const rows = (takenPages || []).filter((r: any) => r.page_id === pid);
        if (rows.length === 0) return { taken: false, mine: false };
        const mine = rows.some((r: any) =>
          workspace_id ? r.workspace_id === workspace_id : (r.workspace_id === null && r.owner_id === user.id),
        );
        return { taken: !mine, mine };
      };
      const adStatus = (aid: string) => {
        const rows = (takenAds || []).filter((r: any) => r.ad_account_id === aid);
        if (rows.length === 0) return { taken: false, mine: false };
        const mine = rows.some((r: any) =>
          workspace_id ? r.workspace_id === workspace_id : (r.workspace_id === null && r.owner_id === user.id),
        );
        return { taken: !mine, mine };
      };
      const waStatus = (pid: string) => {
        const rows = (takenWa || []).filter((r: any) => r.phone_number_id === pid);
        if (rows.length === 0) return { taken: false, mine: false };
        const mine = rows.some((r: any) =>
          workspace_id ? r.workspace_id === workspace_id : (r.workspace_id === null && r.owner_id === user.id),
        );
        return { taken: !mine, mine };
      };

      return json({
        session_id,
        workspace_id,
        pages: (pending.pages || []).map((p: any) => ({
          page_id: p.id,
          name: p.name,
          ...pageStatus(p.id),
        })),
        ad_accounts: (pending.ad_accounts || []).map((a: any) => ({
          ad_account_id: a.id,
          account_id: a.account_id,
          name: a.name,
          currency: a.currency,
          business_name: a.business_name,
          ...adStatus(a.id),
        })),
        wa_numbers: (pending.wa_numbers || []).map((p: any) => ({
          phone_number_id: p.phone_number_id,
          business_account_id: p.business_account_id,
          business_name: p.business_name,
          display_phone_number: p.display_phone_number,
          verified_name: p.verified_name,
          ...waStatus(p.phone_number_id),
        })),
      });
    }

    // ------- ATTACH -------
    if (action === "attach") {
      const selectedPageIds: string[] = Array.isArray(body.page_ids) ? body.page_ids : [];
      const selectedAdAccountIds: string[] = Array.isArray(body.ad_account_ids) ? body.ad_account_ids : [];
      const selectedPhoneIds: string[] = Array.isArray(body.phone_number_ids) ? body.phone_number_ids : [];

      let attachedPages = 0, skippedPages = 0, subscribedPages = 0;
      let attachedAds = 0, skippedAds = 0;
      let attachedWa = 0, skippedWa = 0;

      const pagesData = (pending.pages || []) as Array<{ id: string; name: string; access_token: string }>;
      for (const p of pagesData) {
        if (!selectedPageIds.includes(p.id)) continue;

        // Isolation check
        const { data: taken } = await admin
          .from("meta_pages")
          .select("id, workspace_id, owner_id")
          .eq("page_id", p.id);
        const conflict = (taken || []).some((row: any) =>
          workspace_id
            ? row.workspace_id && row.workspace_id !== workspace_id
            : row.workspace_id !== null || row.owner_id !== user.id,
        );
        if (conflict) { skippedPages++; continue; }

        // Subscribe to webhook fields
        let subscribed = false;
        try {
          const fields = ["leadgen", "messages", "messaging_postbacks", "message_reactions", "message_reads"].join(",");
          await fetch(
            `${graphApi}/${p.id}/subscribed_apps?subscribed_fields=${fields}&access_token=${p.access_token}`,
            { method: "POST" },
          );
          const checkRes = await fetch(
            `${graphApi}/${p.id}/subscribed_apps?access_token=${p.access_token}`,
          );
          const checkJson = await checkRes.json().catch(() => ({}));
          const apps = Array.isArray((checkJson as any)?.data) ? (checkJson as any).data : [];
          subscribed = apps.some((e: any) => e?.id === Deno.env.get("FB_APP_ID"));
        } catch (e) {
          console.error("[finalize] subscribe failed", p.id, e);
        }
        if (subscribed) subscribedPages++;

        // Upsert meta_pages scoped to current workspace
        const scope = (q: any) =>
          workspace_id ? q.eq("workspace_id", workspace_id) : q.eq("owner_id", user.id).is("workspace_id", null);
        const { data: existing } = await scope(
          admin.from("meta_pages").select("id").eq("page_id", p.id),
        ).maybeSingle();

        const payload = {
          owner_id: user.id,
          workspace_id,
          page_id: p.id,
          page_name: p.name || "",
          page_access_token: p.access_token,
          user_access_token: userToken,
          token_valid: true,
          is_active: true,
          subscribed,
        };
        if (existing) {
          await admin.from("meta_pages").update(payload as any).eq("id", existing.id);
        } else {
          await admin.from("meta_pages").insert(payload as any);
        }
        attachedPages++;

        // Also register as conversational channel identity (Messenger + IG)
        try {
          let igId: string | null = null;
          let igUsername: string | null = null;
          const igRes = await fetch(
            `${graphApi}/${p.id}?fields=instagram_business_account{id,username}&access_token=${p.access_token}`,
          );
          const igJson = await igRes.json();
          igId = igJson?.instagram_business_account?.id ?? null;
          igUsername = igJson?.instagram_business_account?.username ?? null;

          const { data: existingIdentity } = await admin
            .from("meta_channel_identities")
            .select("id")
            .eq("page_id", p.id)
            .maybeSingle();
          const identityPayload: Record<string, unknown> = {
            owner_id: user.id,
            workspace_id,
            page_id: p.id,
            page_name: p.name || "",
            page_access_token: p.access_token,
            instagram_business_account_id: igId,
            instagram_username: igUsername,
            is_subscribed_messages: true,
            is_subscribed_instagram: !!igId,
          };
          if (existingIdentity) {
            await admin.from("meta_channel_identities").update(identityPayload).eq("id", existingIdentity.id);
          } else {
            await admin.from("meta_channel_identities").insert(identityPayload);
          }
        } catch (e) {
          console.error("[finalize] channel identity failed", p.id, e);
        }
      }

      const adsData = (pending.ad_accounts || []) as Array<any>;
      for (const ad of adsData) {
        if (!selectedAdAccountIds.includes(ad.id)) continue;

        const { data: taken } = await admin
          .from("meta_ad_accounts")
          .select("id, workspace_id, owner_id")
          .eq("ad_account_id", ad.id);
        const conflict = (taken || []).some((row: any) =>
          workspace_id
            ? row.workspace_id && row.workspace_id !== workspace_id
            : row.workspace_id !== null || row.owner_id !== user.id,
        );
        if (conflict) { skippedAds++; continue; }

        const scope = (q: any) =>
          workspace_id ? q.eq("workspace_id", workspace_id) : q.eq("owner_id", user.id).is("workspace_id", null);
        const { data: existingAd } = await scope(
          admin.from("meta_ad_accounts").select("id").eq("ad_account_id", ad.id),
        ).maybeSingle();

        const adPayload = {
          owner_id: user.id,
          workspace_id,
          ad_account_id: ad.id,
          account_id: ad.account_id || null,
          account_name: ad.name || ad.account_id || ad.id,
          currency: ad.currency || null,
          business_id: ad.business_id || null,
          business_name: ad.business_name || null,
          is_active: true,
        };
        if (existingAd) {
          await admin.from("meta_ad_accounts").update(adPayload as any).eq("id", existingAd.id);
        } else {
          await admin.from("meta_ad_accounts").insert(adPayload as any);
        }
        attachedAds++;
      }

      const waData = (pending.wa_numbers || []) as Array<any>;
      for (const ph of waData) {
        if (!selectedPhoneIds.includes(ph.phone_number_id)) continue;

        const { data: taken } = await admin
          .from("whatsapp_config")
          .select("id, workspace_id, owner_id")
          .eq("phone_number_id", ph.phone_number_id);
        const conflict = (taken || []).some((row: any) =>
          workspace_id
            ? row.workspace_id && row.workspace_id !== workspace_id
            : row.workspace_id !== null || row.owner_id !== user.id,
        );
        if (conflict) { skippedWa++; continue; }

        const scope = (q: any) =>
          workspace_id ? q.eq("workspace_id", workspace_id) : q.eq("owner_id", user.id).is("workspace_id", null);
        const { data: existCfg } = await scope(
          admin.from("whatsapp_config").select("id, is_active").eq("phone_number_id", ph.phone_number_id),
        ).maybeSingle();

        const waPayload = {
          owner_id: user.id,
          workspace_id,
          phone_number_id: ph.phone_number_id,
          business_account_id: ph.business_account_id,
          access_token: userToken,
          display_phone_number: ph.display_phone_number || "",
          verified_name: ph.verified_name || ph.business_name || "",
          is_active: existCfg?.is_active ?? false,
        };
        if (existCfg) {
          await admin.from("whatsapp_config").update(waPayload).eq("id", existCfg.id);
        } else {
          await admin.from("whatsapp_config").insert(waPayload);
        }
        attachedWa++;
      }

      // Consume the pending session
      await admin.from("meta_oauth_pending").delete().eq("id", session_id);

      return json({
        ok: true,
        attached_pages: attachedPages,
        attached_ad_accounts: attachedAds,
        subscribed_pages: subscribedPages,
        skipped_pages: skippedPages,
        skipped_ad_accounts: skippedAds,
        attached_wa: attachedWa,
        skipped_wa: skippedWa,
      });
    }

    if (action === "discard") {
      await admin.from("meta_oauth_pending").delete().eq("id", session_id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[meta-oauth-finalize]", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
