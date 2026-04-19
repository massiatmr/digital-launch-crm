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
      const { data: cfg } = await applyScope(
        admin.from("whatsapp_config").select("*"),
      ).maybeSingle();
      if (!cfg) return json({ error: "Config WhatsApp introuvable" }, 404);

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
      const { data: cfg } = await applyScope(
        admin.from("whatsapp_config").select("*"),
      ).maybeSingle();
      if (!cfg) return json({ error: "Config WhatsApp introuvable" }, 404);

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
      const { data: cfg } = await applyScope(
        admin.from("whatsapp_config").select("id"),
      ).maybeSingle();
      if (!cfg) return json({ ok: true });
      const { error } = await admin.from("whatsapp_config").delete().eq("id", cfg.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "toggle_active") {
      const { data: cfg } = await applyScope(
        admin.from("whatsapp_config").select("id, is_active"),
      ).maybeSingle();
      if (!cfg) return json({ error: "Config introuvable" }, 404);
      const { error } = await admin
        .from("whatsapp_config")
        .update({ is_active: !cfg.is_active })
        .eq("id", cfg.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, is_active: !cfg.is_active });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
