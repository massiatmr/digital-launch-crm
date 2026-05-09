// Manage current workspace's WhatsApp Cloud API config
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

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
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const workspace_id = (body.workspace_id as string | undefined) || null;

    // Verify workspace membership when provided
    if (workspace_id) {
      const { data: isMember } = await admin.rpc("is_workspace_member", {
        _workspace_id: workspace_id,
        _user_id: user.id,
      });
      if (!isMember) return json({ error: "Not a member of this workspace" }, 403);
    }

    // Helper: build the scoping filter (workspace if provided, else owner-only legacy rows)
    const applyScope = (q: any) =>
      workspace_id
        ? q.eq("workspace_id", workspace_id)
        : q.eq("owner_id", user.id).is("workspace_id", null);

    // Get the active config (used for sending). Used by most actions.
    const getActiveConfig = async () => {
      const { data } = await applyScope(
        admin.from("whatsapp_config").select("*").eq("is_active", true),
      ).maybeSingle();
      return data;
    };

    if (action === "list_numbers") {
      // Return all WA numbers detected for this workspace (multi-number support)
      const { data, error } = await applyScope(
        admin.from("whatsapp_config").select("*"),
      ).order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ numbers: data || [] });
    }

    if (action === "activate_number") {
      const { phone_number_id } = body;
      if (!phone_number_id) return json({ error: "phone_number_id requis" }, 400);
      // Deactivate all others in this scope
      await applyScope(admin.from("whatsapp_config").update({ is_active: false }));
      // Activate the chosen one
      const { data: target } = await applyScope(
        admin.from("whatsapp_config").select("id").eq("phone_number_id", phone_number_id),
      ).maybeSingle();
      if (!target) return json({ error: "Numéro introuvable" }, 404);
      const { error } = await admin
        .from("whatsapp_config")
        .update({ is_active: true })
        .eq("id", target.id);
      if (error) return json({ error: error.message }, 500);

      // Auto-subscribe webhook
      const { data: cfg } = await admin
        .from("whatsapp_config")
        .select("*")
        .eq("id", target.id)
        .maybeSingle();
      if (cfg) {
        try {
          const r = await fetch(
            `${GRAPH}/${cfg.business_account_id}/subscribed_apps?access_token=${cfg.access_token}`,
            { method: "POST" },
          );
          if (r.ok) {
            await admin
              .from("whatsapp_config")
              .update({ webhook_subscribed: true })
              .eq("id", target.id);
          }
        } catch (_e) {
          // Non-blocking
        }
      }
      return json({ ok: true });
    }

    if (action === "get") {
      // Returns the active config for this workspace (legacy compatibility)
      const data = await getActiveConfig();
      return json({ config: data });
    }

    if (action === "save") {
      const { phone_number_id, business_account_id, access_token } = body;
      if (!phone_number_id || !business_account_id || !access_token) {
        return json({ error: "phone_number_id, business_account_id, access_token requis" }, 400);
      }

      // Validate token + fetch phone metadata
      const phoneRes = await fetch(
        `${GRAPH}/${phone_number_id}?fields=display_phone_number,verified_name&access_token=${access_token}`,
      );
      const phoneData = await phoneRes.json();
      if (!phoneRes.ok) {
        return json({ error: "Token ou phone_number_id invalide", details: phoneData }, 400);
      }

      // Isolation stricte : empêcher d'attacher un numéro déjà pris dans un autre workspace
      const { data: conflicts } = await admin
        .from("whatsapp_config")
        .select("id, workspace_id, owner_id")
        .eq("phone_number_id", phone_number_id);
      const hasConflict = (conflicts || []).some((row: any) => {
        if (workspace_id) return row.workspace_id && row.workspace_id !== workspace_id;
        return row.workspace_id !== null || row.owner_id !== user.id;
      });
      if (hasConflict) {
        return json(
          { error: "Ce numéro WhatsApp est déjà rattaché à un autre espace de travail. Supprimez-le d'abord depuis cet autre espace." },
          409,
        );
      }

      const { data: existing } = await applyScope(
        admin.from("whatsapp_config").select("id"),
      ).maybeSingle();

      const payload = {
        owner_id: user.id,
        workspace_id,
        phone_number_id,
        business_account_id,
        access_token,
        display_phone_number: phoneData.display_phone_number ?? "",
        verified_name: phoneData.verified_name ?? "",
        is_active: true,
        last_tested_at: new Date().toISOString(),
        last_test_status: "ok",
      };

      if (existing) {
        const { error } = await admin
          .from("whatsapp_config")
          .update(payload)
          .eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("whatsapp_config").insert(payload);
        if (error) return json({ error: error.message }, 500);
      }

      const { data: fresh } = await applyScope(
        admin.from("whatsapp_config").select("*"),
      ).maybeSingle();
      return json({ ok: true, config: fresh });
    }

    if (action === "subscribe_webhook") {
      const cfg = await getActiveConfig();
      if (!cfg) return json({ error: "Aucun numéro WhatsApp actif" }, 404);

      const r = await fetch(
        `${GRAPH}/${cfg.business_account_id}/subscribed_apps?access_token=${cfg.access_token}`,
        { method: "POST" },
      );
      const data = await r.json();
      if (!r.ok) return json({ error: "Échec abonnement webhook", details: data }, 400);

      await admin
        .from("whatsapp_config")
        .update({ webhook_subscribed: true })
        .eq("id", cfg.id);
      return json({ ok: true, details: data });
    }

    if (action === "test_send") {
      const { to, template_name, language_code, text } = body;
      if (!to) return json({ error: "Numéro destinataire requis (format E.164 ex 33612345678)" }, 400);
      const cfg = await getActiveConfig();
      if (!cfg) return json({ error: "Aucun numéro WhatsApp actif" }, 404);

      let payload: Record<string, unknown>;
      if (text) {
        payload = {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: String(text).slice(0, 1000) },
        };
      } else {
        payload = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: template_name || "hello_world",
            language: { code: language_code || "en_US" },
          },
        };
      }

      const r = await fetch(
        `${GRAPH}/${cfg.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        if (data?.error?.code === 131058) {
          return json(
            {
              error:
                "Le template hello_world ne peut être envoyé que depuis un Public Test Number Meta. Utilise un template approuvé dans WhatsApp Manager, ou le numéro de test public Meta.",
              details: data,
            },
            400,
          );
        }
        return json({ error: "Échec envoi test", details: data }, 400);
      }
      return json({ ok: true, details: data });
    }

    if (action === "delete") {
      const { phone_number_id } = body;
      let targetId: string | null = null;
      if (phone_number_id) {
        const { data: cfg } = await applyScope(
          admin.from("whatsapp_config").select("id").eq("phone_number_id", phone_number_id),
        ).maybeSingle();
        targetId = cfg?.id ?? null;
      } else {
        const cfg = await getActiveConfig();
        targetId = cfg?.id ?? null;
      }
      if (!targetId) return json({ ok: true });
      const { error } = await admin.from("whatsapp_config").delete().eq("id", targetId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete_all") {
      const { error } = await applyScope(admin.from("whatsapp_config").delete());
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "toggle_active") {
      const cfg = await getActiveConfig();
      if (!cfg) return json({ error: "Aucun numéro actif" }, 404);
      const { error } = await admin
        .from("whatsapp_config")
        .update({ is_active: !cfg.is_active })
        .eq("id", cfg.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, is_active: !cfg.is_active });
    }

    if (action === "resync") {
      // Re-fetch phone numbers from Meta for every WABA already linked in this scope.
      // Adds new numbers, updates display info, and removes numbers that no longer exist on Meta side.
      const { data: existing } = await applyScope(
        admin.from("whatsapp_config").select("*"),
      );
      const rows = (existing as any[]) || [];
      if (rows.length === 0) {
        return json({ error: "Aucune connexion WhatsApp à resynchroniser. Connectez Meta d'abord." }, 404);
      }

      // Group by WABA + token
      const wabaMap = new Map<string, { token: string; rows: any[] }>();
      for (const r of rows) {
        if (!r.business_account_id || !r.access_token) continue;
        const key = r.business_account_id;
        if (!wabaMap.has(key)) wabaMap.set(key, { token: r.access_token, rows: [] });
        wabaMap.get(key)!.rows.push(r);
      }

      let added = 0;
      let updated = 0;
      let removed = 0;
      const errors: any[] = [];
      const liveIds = new Set<string>();

      for (const [wabaId, { token, rows: wabaRows }] of wabaMap.entries()) {
        const r = await fetch(
          `${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${token}`,
        );
        const j = await r.json();
        if (!r.ok) {
          errors.push({ waba: wabaId, error: j });
          continue;
        }
        const phones = (j.data || []) as any[];
        for (const ph of phones) {
          liveIds.add(ph.id);
          const match = wabaRows.find((x) => x.phone_number_id === ph.id);
          const payload = {
            display_phone_number: ph.display_phone_number || "",
            verified_name: ph.verified_name || "",
            last_tested_at: new Date().toISOString(),
            last_test_status: "ok",
          };
          if (match) {
            await admin.from("whatsapp_config").update(payload as any).eq("id", match.id);
            updated++;
          } else {
            await admin.from("whatsapp_config").insert({
              owner_id: user.id,
              workspace_id,
              phone_number_id: ph.id,
              business_account_id: wabaId,
              access_token: token,
              is_active: false,
              ...payload,
            } as any);
            added++;
          }
        }
      }

      // Remove stale numbers (existed in DB but no longer returned by Meta)
      for (const r of rows) {
        if (r.phone_number_id && !liveIds.has(r.phone_number_id)) {
          await admin.from("whatsapp_config").delete().eq("id", r.id);
          removed++;
        }
      }

      return json({ ok: true, added, updated, removed, errors });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
