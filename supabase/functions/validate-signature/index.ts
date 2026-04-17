import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // GET — fetch contract data by token
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token || token.length < 10) {
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("contract_signatures")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (data.status === "signed") {
        return new Response(JSON.stringify({ error: "already_signed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(data.expires_at) < new Date()) {
        // Update status to expired
        await supabase
          .from("contract_signatures")
          .update({ status: "expired" })
          .eq("id", data.id);
        return new Response(JSON.stringify({ error: "expired" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ contract: data.contract_data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST — record signature
    if (req.method === "POST") {
      const { token, signatureBase64 } = await req.json();
      if (!token || !signatureBase64) {
        return new Response(JSON.stringify({ error: "missing_fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("contract_signatures")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (data.status === "signed") {
        return new Response(JSON.stringify({ error: "already_signed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Capture IP + user agent
      const signerIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || "unknown";
      const signerUserAgent = req.headers.get("user-agent") || "unknown";

      const signedAt = new Date().toISOString();
      // Update signature record
      const { error: updateError } = await supabase
        .from("contract_signatures")
        .update({
          signature_image: signatureBase64,
          signed_at: signedAt,
          signer_ip: signerIp,
          signer_user_agent: signerUserAgent,
          status: "signed",
        })
        .eq("id", data.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: "update_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await supabase.from("client_activities").insert({
        client_id: data.client_id,
        owner_id: data.owner_id,
        action: "Contrat signé",
        description: `Le client a signé le contrat électroniquement (IP : ${signerIp})`,
      });

      return new Response(JSON.stringify({
        success: true,
        contract: data.contract_data,
        signature: {
          signatureImage: signatureBase64,
          signedAt,
          signerIp,
          signerUserAgent,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
