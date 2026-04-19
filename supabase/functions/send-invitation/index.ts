import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const workspaceId: string | null = body.workspace_id || null;
    const workspaceRole: "owner" | "member" = body.workspace_role === "owner" ? "owner" : "member";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Email invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: either global admin OR owner of target workspace
    let allowed = false;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleRow) allowed = true;

    if (!allowed && workspaceId) {
      const { data: isOwner } = await admin.rpc("is_workspace_owner", {
        _workspace_id: workspaceId,
        _user_id: user.id,
      });
      if (isOwner === true) allowed = true;
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertPayload: Record<string, unknown> = { email, invited_by: user.id };
    if (workspaceId) {
      insertPayload.workspace_id = workspaceId;
      insertPayload.workspace_role = workspaceRole;
    }

    const { data: invite, error: insertErr } = await admin
      .from("invitations")
      .insert(insertPayload)
      .select("id, token, expires_at, workspace_id, workspace_role")
      .single();

    if (insertErr || !invite) {
      return new Response(JSON.stringify({ error: insertErr?.message || "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "https://digital-launch-crm.lovable.app";
    const url = `${origin}/auth?invite=${invite.token}`;

    // Récupère nom du workspace + nom inviteur pour l'email
    let workspaceName: string | null = null;
    if (invite.workspace_id) {
      const { data: ws } = await admin
        .from("workspaces")
        .select("company_name")
        .eq("id", invite.workspace_id)
        .maybeSingle();
      workspaceName = ws?.company_name || null;
    }
    let inviterName: string | null = null;
    {
      const { data: prof } = await admin
        .from("owner_profiles")
        .select("company_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      inviterName = prof?.company_name || prof?.email || user.email || null;
    }

    // Envoi email transactionnel (best-effort, n'échoue pas l'invitation)
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "workspace-invitation",
          recipientEmail: email,
          idempotencyKey: `workspace-invite-${invite.id}`,
          templateData: {
            workspaceName: workspaceName || "votre nouvel espace",
            inviterName,
            acceptUrl: url,
            role: invite.workspace_role,
          },
        },
      });
    } catch (mailErr) {
      console.error("[send-invitation] email send failed", mailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        url,
        token: invite.token,
        expires_at: invite.expires_at,
        workspace_id: invite.workspace_id,
        workspace_role: invite.workspace_role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-invitation]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
