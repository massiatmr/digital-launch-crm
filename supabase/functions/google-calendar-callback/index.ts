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
    let userId: string | null = null;
    let workspaceId: string | null = null;
    try {
      const decoded = JSON.parse(atob(state));
      userId = decoded?.u ?? null;
      workspaceId = decoded?.w ?? null;
    } catch (_) {
      // legacy: state is the user id
      userId = state;
    }
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

    // Look for an existing row scoped to (workspace_id) if provided, else (user_id)
    let existing: any = null;
    if (workspaceId) {
      const { data } = await supabase
        .from("google_tokens")
        .select("id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabase
        .from("google_tokens")
        .select("id")
        .eq("user_id", userId)
        .is("workspace_id", null)
        .maybeSingle();
      existing = data;
    }

    const payload: any = {
      user_id: userId,
      workspace_id: workspaceId,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
      is_primary: true,
    };

    let upsertError: any = null;
    if (existing?.id) {
      const { error } = await supabase.from("google_tokens").update(payload).eq("id", existing.id);
      upsertError = error;
    } else {
      const { error } = await supabase.from("google_tokens").insert(payload);
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
