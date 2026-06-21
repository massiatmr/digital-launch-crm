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

  // Auth: accept service role OR a valid authenticated user JWT
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const isServiceRole = Boolean(auth) && auth === SUPABASE_SERVICE_ROLE_KEY;
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

    // Préférer subscription_ids quand on les a (ciblage exact, pas de doublon).
    // Fallback sur external_id seulement si on n'a aucun device en base.
    const attempts: Array<{ method: "external_id" | "subscription_ids"; payload: Record<string, unknown> }> =
      subscriptionIds.length > 0
        ? [{ method: "subscription_ids", payload: { ...basePayload, include_subscription_ids: subscriptionIds } }]
        : [{ method: "external_id", payload: { ...basePayload, include_aliases: { external_id: [user_id] } } }];

    let lastJson: unknown = null;
    let lastStatus = 0;
    let lastMethod: "external_id" | "subscription_ids" = subscriptionIds.length > 0 ? "subscription_ids" : "external_id";

    for (const attempt of attempts) {
      const { res, json } = await sendToOneSignal(attempt.payload);
      console.log(`OneSignal response (${attempt.method}):`, res.status, JSON.stringify(json));
      lastJson = json;
      lastStatus = res.status;
      lastMethod = attempt.method;

      if (res.ok && hasAcceptedNotification(json)) {
        return respond({
          ok: true,
          result: json,
          diagnostics: {
            final_url: absoluteUrl,
            provider_status: res.status,
            targeting_method: attempt.method,
            subscription_count: subscriptionIds.length,
          },
        });
      }
    }

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
