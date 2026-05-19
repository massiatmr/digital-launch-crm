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

    // Validate file size & type to prevent storage abuse and malicious uploads
    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    const ALLOWED_TYPES = new Set([
      "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
      "application/pdf",
      "video/mp4", "video/quicktime", "video/webm",
      "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg",
      "text/plain", "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "File too large (max 25MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(JSON.stringify({ error: "File type not allowed" }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeName = (file.name || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 100);

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
