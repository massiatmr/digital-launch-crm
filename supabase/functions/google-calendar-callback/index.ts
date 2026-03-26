import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("state");

    if (!code || !userId) {
      return new Response("Missing code or state", { status: 400 });
    }

    const clientId = Deno.env.get("Google_Client_id")!;
    const clientSecret = Deno.env.get("Client_secret")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Exchange authorization code for tokens
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

    // Store tokens using service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await supabase
      .from("google_tokens")
      .upsert(
        {
          user_id: userId,
          access_token,
          refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Token storage error:", upsertError);
      return new Response("Failed to store tokens", { status: 500 });
    }

    // Redirect to app with success
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
