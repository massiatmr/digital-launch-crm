const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = "46f7498d-e02a-4ee9-bbc6-28f0ec0d7aea";
const APP_BASE_URL = "https://digital-launch-crm.lovable.app";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

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
  };
}

function respond(payload: ApiResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    let absoluteUrl: string | undefined;
    if (url) {
      absoluteUrl = url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `${APP_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
    }

    const notifPayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [user_id] },
      target_channel: "push",
      headings: { en: title, fr: title },
      contents: { en: body, fr: body },
    };

    if (absoluteUrl) {
      notifPayload.web_url = absoluteUrl;
    }

    if (tag) {
      notifPayload.web_push_topic = tag;
    }

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notifPayload),
    });

    const json = await res.json();
    console.log("OneSignal response:", res.status, JSON.stringify(json));

    const hasProviderErrors = Boolean((json as any)?.errors);
    const hasNotificationId = Boolean((json as any)?.id);

    if (!res.ok || hasProviderErrors || !hasNotificationId) {
      return respond({
        ok: false,
        error: "onesignal_error",
        hint: hasProviderErrors
          ? "Aucun appareil OneSignal n'est lié à cet utilisateur pour le moment"
          : "Notification non acceptée par le provider",
        details: json,
        diagnostics: {
          final_url: absoluteUrl,
          error_stage: "provider_request",
          provider_status: res.status,
        },
      });
    }

    return respond({
      ok: true,
      result: json,
      diagnostics: {
        final_url: absoluteUrl,
        provider_status: res.status,
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
