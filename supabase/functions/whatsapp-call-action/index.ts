// Action sur un appel WhatsApp : accept | reject | end
// Body: { call_db_id, action: 'accept'|'reject'|'end', sdp_answer? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { call_db_id, action, sdp_answer } = await req.json();
    if (!call_db_id || !action) return new Response(JSON.stringify({ error: "Missing call_db_id or action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: callRow } = await admin.from("whatsapp_calls").select("*, leads(workspace_id, owner_id)").eq("id", call_db_id).maybeSingle();
    if (!callRow) return new Response(JSON.stringify({ error: "Call not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const lead = (callRow as any).leads;
    {
      let allowed = lead?.owner_id === user.id && !lead?.workspace_id;
      if (!allowed && lead?.workspace_id) {
        const { data: m } = await admin.rpc("is_workspace_member", { _workspace_id: lead.workspace_id, _user_id: user.id });
        allowed = !!m;
      }
      if (!allowed) { const { data: a } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" }); allowed = !!a; }
      if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
    if (lead?.workspace_id) configQuery = configQuery.eq("workspace_id", lead.workspace_id);
    else configQuery = configQuery.eq("owner_id", lead?.owner_id).is("workspace_id", null);
    const { data: config } = await configQuery.maybeSingle();

    const waCallId = (callRow as any).wa_call_id;
    let metaError: string | null = null;

    if (config && waCallId) {
      const actionMap: Record<string, string> = { accept: "accept", reject: "reject", end: "terminate" };
      try {
        const resp = await fetch(`${GRAPH}/${(config as any).phone_number_id}/call`, {
          method: "POST",
          headers: { Authorization: `Bearer ${(config as any).access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            call_id: waCallId,
            action: actionMap[action] || action,
            session: sdp_answer ? { sdp_type: "answer", sdp: sdp_answer } : undefined,
          }),
        });
        if (!resp.ok) metaError = await resp.text();
      } catch (e) { metaError = String(e); }
    }

    const now = new Date().toISOString();
    const update: any = {};
    if (action === "accept") { update.status = "answered"; update.answered_at = now; }
    if (action === "reject") { update.status = "declined"; update.ended_at = now; }
    if (action === "end") {
      update.status = "ended";
      update.ended_at = now;
      if ((callRow as any).answered_at) {
        const dur = Math.round((Date.now() - new Date((callRow as any).answered_at).getTime()) / 1000);
        update.duration_seconds = dur;
      }
    }
    await (admin.from("whatsapp_calls") as any).update(update).eq("id", call_db_id);

    return new Response(JSON.stringify({ success: true, meta_error: metaError }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("whatsapp-call-action error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
