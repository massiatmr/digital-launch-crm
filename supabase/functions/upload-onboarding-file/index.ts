import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;
    const file = formData.get("file") as File;
    const clientId = formData.get("client_id") as string;

    if (!token || !file || !clientId) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify token belongs to this client
    const { data: onboarding, error: obError } = await supabase
      .from("client_onboarding_responses")
      .select("id, client_id")
      .eq("token", token)
      .eq("client_id", clientId)
      .single();

    if (obError || !onboarding) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = `onboarding/${clientId}/${Date.now()}-${file.name}`;
    const arrayBuf = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("client-resources")
      .upload(path, arrayBuf, { contentType: file.type });

    if (uploadError) {
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = await supabase.storage
      .from("client-resources")
      .createSignedUrl(path, 3600 * 24 * 365);

    return new Response(
      JSON.stringify({ url: urlData?.signedUrl || "", name: file.name }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Upload error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
