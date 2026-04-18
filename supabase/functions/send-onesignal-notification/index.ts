const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = "46f7498d-e02a-4ee9-bbc6-28f0ec0d7aea";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

interface Payload {
  user_id: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ONESIGNAL_REST_API_KEY) {
      throw new Error("ONESIGNAL_REST_API_KEY not configured");
    }

    const { user_id, title, body, url, tag } = (await req.json()) as Payload;
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifPayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [user_id] },
      target_channel: "push",
      headings: { en: title, fr: title },
      contents: { en: body, fr: body },
    };
    if (url) {
      // OneSignal exige une URL absolue (http:// ou https://) et n'accepte pas url + web_url ensemble
      const absoluteUrl = url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://digital-launch-crm.lovable.app${url.startsWith("/") ? url : `/${url}`}`;
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
      return new Response(JSON.stringify({
        error: "onesignal_error",
        details: json,
        hint: hasProviderErrors
          ? "Aucun appareil OneSignal n'est lié à cet utilisateur pour le moment"
          : "Notification non acceptée par le provider",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: json }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-onesignal-notification error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
