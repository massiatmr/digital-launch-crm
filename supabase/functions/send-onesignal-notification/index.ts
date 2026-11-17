import { isServiceRoleToken } from "../_shared/internalAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = "46f7498d-e02a-4ee9-bbc6-28f0ec0d7aea";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Payload {
  user_id: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  hint?: string;
  details?: unknown;
  result?: unknown;
  diagnostics?: {
    final_url?: string;
    error_stage?: string;
    provider_status?: number;
    targeting_method?: string;
    subscription_count?: number;
  };
}

function respond(payload: ApiResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSubscriptionIds(userId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [] as string[];

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, status")
    .eq("user_id", userId)
    .like("endpoint", "onesignal:%")
    .limit(20);

  if (error) {
    console.error("push_subscriptions lookup error:", error);
    return [];
  }

  return (data ?? [])
    .filter((row: any) => row?.status !== "inactive")
    .map((row: any) => String(row.endpoint || "").replace(/^onesignal:/, ""))
    .filter(Boolean);
}

async function sendToOneSignal(payload: Record<string, unknown>) {
  const res = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  return { res, json };
}

function hasAcceptedNotification(json: any) {
  return Boolean(json?.id) && !json?.errors;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: accept service role env value, any JWT with role=service_role,
  // OR a valid authenticated user JWT.
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  let isServiceRole = Boolean(auth) && auth === SUPABASE_SERVICE_ROLE_KEY;
  if (!isServiceRole && auth) isServiceRole = await isServiceRoleToken(auth);
  let callerUserId: string | null = null;
  let authorized = isServiceRole;
  if (!authorized && auth) {
    try {
      const supa = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${auth}` } } },
      );
      const { data: claims } = await supa.auth.getClaims(auth);
      if (claims?.claims?.sub) {
        authorized = true;
        callerUserId = claims.claims.sub as string;
      }
    } catch { /* ignore */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ONESIGNAL_REST_API_KEY) {
      return respond({
        ok: false,
        error: "ONESIGNAL_REST_API_KEY not configured",
        diagnostics: { error_stage: "missing_secret" },
      });
    }

    const { user_id, title, body, url, tag } = (await req.json()) as Payload;
    if (!user_id || !title || !body) {
      return respond({
        ok: false,
        error: "missing fields",
        details: { user_id: Boolean(user_id), title: Boolean(title), body: Boolean(body) },
        diagnostics: { error_stage: "validation" },
      });
    }

    // Non service-role callers can only push to themselves
    if (!isServiceRole && user_id !== callerUserId) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let absoluteUrl: string | undefined;
    if (url) {
      absoluteUrl = url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `${APP_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
    }

    const subscriptionIds = await getSubscriptionIds(user_id);
    const basePayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title, fr: title },
      contents: { en: body, fr: body },
      target_channel: "push",
    };

    if (absoluteUrl) basePayload.web_url = absoluteUrl;
    if (tag) basePayload.web_push_topic = tag;

    const diagBase = { final_url: absoluteUrl, subscription_count: subscriptionIds.length };

    // 1) Ciblage exact par subscription_ids quand on en a.
    if (subscriptionIds.length > 0) {
      const { res, json } = await sendToOneSignal({
        ...basePayload,
        include_subscription_ids: subscriptionIds,
      });
      console.log("OneSignal response (subscription_ids):", res.status, JSON.stringify(json));

      const invalid: string[] = Array.isArray((json as any)?.errors?.invalid_player_ids)
        ? (json as any).errors.invalid_player_ids
        : [];

      // Nettoyage : les appareils refusés par OneSignal passent en inactive
      // (sinon ils polluent chaque envoi et masquent les vrais succès).
      if (invalid.length > 0) {
        try {
          const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          await admin
            .from("push_subscriptions")
            .update({ status: "inactive" })
            .eq("user_id", user_id)
            .in("endpoint", invalid.map((id) => `onesignal:${id}`));
          console.log("Marked inactive OneSignal subscriptions:", invalid.length);
        } catch (e) {
          console.error("failed to deactivate stale subscriptions", e);
        }
      }

      const validCount = subscriptionIds.length - invalid.length;
      // Succès partiel = succès : au moins un appareil a reçu la notif.
      if (res.ok && (json as any)?.id && validCount > 0) {
        return respond({
          ok: true,
          result: json,
          diagnostics: {
            ...diagBase,
            provider_status: res.status,
            targeting_method: "subscription_ids",
          },
        });
      }
      // Sinon : tous les appareils listés sont morts → on retente via external_id.
    }

    // 2) Fallback external_id (appareils enregistrés côté OneSignal mais pas/plus en base).
    const { res: res2, json: json2 } = await sendToOneSignal({
      ...basePayload,
      include_aliases: { external_id: [user_id] },
    });
    console.log("OneSignal response (external_id):", res2.status, JSON.stringify(json2));

    if (res2.ok && hasAcceptedNotification(json2)) {
      return respond({
        ok: true,
        result: json2,
        diagnostics: { ...diagBase, provider_status: res2.status, targeting_method: "external_id" },
      });
    }

    const lastJson: unknown = json2;
    const lastStatus = res2.status;
    const lastMethod: "external_id" | "subscription_ids" = "external_id";


    return respond({
      ok: false,
      error: "onesignal_error",
      hint: subscriptionIds.length > 0
        ? "Appareil détecté, mais OneSignal a refusé l'envoi avec les deux méthodes de ciblage"
        : "Aucun appareil OneSignal n'est lié à cet utilisateur pour le moment",
      details: lastJson,
      diagnostics: {
        final_url: absoluteUrl,
        error_stage: "provider_request",
        provider_status: lastStatus,
        targeting_method: lastMethod,
        subscription_count: subscriptionIds.length,
      },
    });
  } catch (e) {
    console.error("send-onesignal-notification error:", e);
    return respond({
      ok: false,
      error: (e as Error).message,
      diagnostics: { error_stage: "exception" },
    });
  }
});
