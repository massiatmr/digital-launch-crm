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
    const recipientName: string | null = body.name ? String(body.name).trim() : null;
    const sendEmail: boolean = body.send_email !== false; // default true
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

    // Envoi email via SMTP (best-effort, n'échoue pas l'invitation)
    if (sendEmail) {
      try {
        const wsLabel = workspaceName || "un nouvel espace";
        const greeting = recipientName ? `Bonjour ${recipientName},` : "Bonjour,";
        const inviterLine = inviterName ? `${inviterName} vous a invité` : "Vous avez été invité";
        const roleLabel = invite.workspace_role === "owner" ? "propriétaire" : "membre";
        const subject = `Invitation à rejoindre ${wsLabel}`;

        const html = `<!DOCTYPE html>
<html lang="fr">
  <head><meta charset="utf-8"><title>${subject}</title></head>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;max-width:520px;">
          <tr><td>
            <h1 style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 20px;">Vous êtes invité</h1>
            <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;">${greeting}</p>
            <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
              ${inviterLine} à rejoindre <strong>${wsLabel}</strong> en tant que <strong>${roleLabel}</strong>.
              Cliquez sur le bouton ci-dessous pour accepter l'invitation et créer votre compte.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${url}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:15px;font-weight:600;border-radius:8px;padding:14px 28px;text-decoration:none;">
                Accepter l'invitation
              </a>
            </p>
            <p style="font-size:13px;color:#777;line-height:1.5;margin:0 0 8px;">Ou copiez ce lien dans votre navigateur :</p>
            <p style="font-size:12px;color:#7c3aed;word-break:break-all;margin:0 0 24px;">${url}</p>
            <p style="font-size:13px;color:#999;margin:30px 0 0;line-height:1.5;">
              Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

        const { error: smtpErr } = await admin.functions.invoke("send-smtp-email", {
          body: { to: email, subject, html },
        });
        if (smtpErr) console.error("[send-invitation] smtp error", smtpErr);
      } catch (mailErr) {
        console.error("[send-invitation] email send failed", mailErr);
      }
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
