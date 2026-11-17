import { verifyState } from "../_shared/internalAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    // state is either a raw user_id (legacy) or a base64 JSON { u, w }
    const verified = await verifyState(state);
    const userId: string | null = verified?.u ?? null;
    let workspaceId: string | null = verified?.w ?? null;
    if (!userId) return new Response("Invalid state", { status: 400 });

    const clientId = Deno.env.get("Google_Client_id")!;
    const clientSecret = Deno.env.get("Client_secret")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Token exchange error:", tokenData);
      return new Response(`Token exchange failed: ${JSON.stringify(tokenData)}`, { status: 400 });
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // If no workspaceId in state, fall back to the user's primary owned workspace
    if (!workspaceId) {
      const { data: ws } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces!inner(created_at)")
        .eq("user_id", userId)
        .eq("role", "owner")
        .order("workspaces(created_at)", { ascending: true })
        .limit(1)
        .maybeSingle();
      workspaceId = (ws as any)?.workspace_id ?? null;
    }

    if (!workspaceId) return new Response("No workspace available", { status: 400 });
    {
      const { data: isMember } = await supabase.rpc("is_workspace_member", { _workspace_id: workspaceId, _user_id: userId });
      if (!isMember) return new Response("Forbidden", { status: 403 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!membership) return new Response("Workspace owner required", { status: 403 });

    const { data: existing } = await supabase
      .from("calendar_accounts")
      .select("id, refresh_token")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase
      .from("calendar_accounts")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId);

    const payload: any = {
      workspace_id: workspaceId,
      provider: "google",
      display_name: "Google Calendar",
      calendar_id: "primary",
      access_token,
      refresh_token: refresh_token || existing?.refresh_token,
      expires_at: expiresAt,
      credentials: { source: "google_oauth", user_id: userId, scope: tokenData.scope || null },
      created_by: userId,
      updated_at: new Date().toISOString(),
      is_primary: true,
      sync_freebusy: true,
    };

    let upsertError: any = null;
    if (existing?.id) {
      const { error } = await supabase.from("calendar_accounts").update(payload).eq("id", existing.id);
      upsertError = error;
    } else {
      const { error } = await supabase.from("calendar_accounts").insert(payload);
      upsertError = error;
    }

    if (upsertError) {
      console.error("Token storage error:", upsertError);
      return new Response("Failed to store tokens", { status: 500 });
    }

    const appUrl = Deno.env.get("SITE_URL") || "https://digital-launch-crm.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/bookings?google=connected` },
    });
  } catch (err) {
    console.error("Callback error:", err);
    return new Response("Internal server error", { status: 500 });
  }
});
