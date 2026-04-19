import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SAFE_TABLES = [
  "leads",
  "clients",
  "offers",
  "offer_pages",
  "bookings",
  "invoices",
  "contract_signatures",
  "lead_activities",
  "client_activities",
  "client_resources",
  "client_onboarding_responses",
  "generated_messages",
  "sales_scripts",
  "reminders",
  "whatsapp_messages",
  "whatsapp_templates",
  "followup_sequence_steps",
  "followup_automation_settings",
  "lead_followup_tasks",
] as const;

// Tables filtered by workspace_id directly
const WORKSPACE_TABLES = new Set([
  "leads", "clients", "offers", "bookings", "invoices", "contract_signatures",
  "lead_activities", "client_activities", "client_resources",
  "generated_messages", "sales_scripts", "reminders",
  "whatsapp_messages", "whatsapp_templates",
  "followup_sequence_steps", "followup_automation_settings", "lead_followup_tasks",
]);

// Sensitive fields to strip from any row (tokens, secrets)
const STRIP_FIELDS = new Set([
  "page_access_token", "access_token", "refresh_token", "verify_token",
  "page_access_token_id", "signature_image", "signed_pdf_path",
]);

function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIP_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { workspace_id } = await req.json().catch(() => ({}));
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify membership
    const { data: membership } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exportData: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      workspace_id,
      exported_by: userId,
    };

    // Workspace metadata
    const { data: ws } = await admin.from("workspaces").select("*").eq("id", workspace_id).single();
    exportData.workspace = ws ? sanitize(ws) : null;

    // All scoped tables
    for (const table of SAFE_TABLES) {
      const filterCol = WORKSPACE_TABLES.has(table) ? "workspace_id" : null;
      let q: any = admin.from(table).select("*");
      if (filterCol) q = q.eq(filterCol, workspace_id);
      const { data, error } = await q;
      if (error) {
        exportData[table] = { error: error.message };
      } else {
        exportData[table] = (data || []).map((r: Record<string, unknown>) => sanitize(r));
      }
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="workspace-${workspace_id}-${Date.now()}.json"`,
      },
    });
  } catch (e) {
    console.error("export-workspace error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
