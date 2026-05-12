import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { lead_id, message, channel } = await req.json().catch(() => ({}));
    if (!lead_id || !message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "lead_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetChannel = channel === "instagram" ? "instagram" : "messenger";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Récupérer le lead
    const { data: lead } = await supabase
      .from("leads")
      .select("id, owner_id, workspace_id, meta_page_id")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead || lead.owner_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trouver le external_thread_id (PSID/IGSID) du dernier message du canal
    const { data: lastMsg } = await supabase
      .from("whatsapp_messages")
      .select("external_thread_id")
      .eq("lead_id", lead_id)
      .eq("channel", targetChannel)
      .not("external_thread_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const externalThreadId = (lastMsg as any)?.external_thread_id as string | undefined;
    if (!externalThreadId) {
      return new Response(JSON.stringify({ error: "No conversation thread for this channel" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer le page token correspondant
    const { data: identity } = await supabase
      .from("meta_channel_identities")
      .select("page_id, page_access_token, instagram_business_account_id")
      .eq("page_id", lead.meta_page_id)
      .maybeSingle();
    if (!identity?.page_access_token) {
      return new Response(JSON.stringify({ error: "No Meta credentials for this page" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST vers Graph API
    // Messenger : POST /me/messages avec page token
    // Instagram : POST /{ig_business_id}/messages avec page token (Graph v21+)
    const graphApi = "https://graph.facebook.com/v21.0";
    const endpoint = targetChannel === "instagram" && identity.instagram_business_account_id
      ? `${graphApi}/${identity.instagram_business_account_id}/messages`
      : `${graphApi}/me/messages`;

    const body = {
      recipient: { id: externalThreadId },
      messaging_type: "RESPONSE",
      message: { text: message },
    };

    const sendRes = await fetch(`${endpoint}?access_token=${identity.page_access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      console.error("[send-channel-message] Graph error", sendJson);
      // Insérer en failed pour traçabilité
      await supabase.from("whatsapp_messages").insert({
        lead_id,
        owner_id: lead.owner_id,
        workspace_id: lead.workspace_id,
        direction: "outbound",
        content: message,
        channel: targetChannel,
        external_thread_id: externalThreadId,
        status: "failed",
        error_message: JSON.stringify(sendJson?.error ?? sendJson).slice(0, 500),
      } as any);
      return new Response(JSON.stringify({ error: sendJson?.error?.message || "Send failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("whatsapp_messages").insert({
      lead_id,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      direction: "outbound",
      content: message,
      channel: targetChannel,
      external_thread_id: externalThreadId,
      wa_message_id: sendJson?.message_id ?? null,
      status: "sent",
    } as any);

    return new Response(JSON.stringify({ success: true, message_id: sendJson?.message_id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-messenger-message]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
