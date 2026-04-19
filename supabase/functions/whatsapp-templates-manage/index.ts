// Gestion des templates WhatsApp : list, sync depuis Meta, create_local, update, delete
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function countVariables(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g);
  if (!matches) return 0;
  const nums = matches.map((m) => parseInt(m.replace(/[^\d]/g, ""), 10));
  return Math.max(...nums);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const action = body.action as string;
    const workspaceId: string | null = body.workspace_id ?? null;

    // Helper : applique le scope workspace si fourni, sinon legacy owner
    const scopeQuery = (q: any) => {
      if (workspaceId) return q.eq("workspace_id", workspaceId);
      return q.eq("owner_id", user.id).is("workspace_id", null);
    };

    if (action === "list") {
      let q = admin.from("whatsapp_templates").select("*").order("created_at", { ascending: false });
      q = scopeQuery(q);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ templates: data });
    }

    if (action === "sync") {
      // Récupérer la config WhatsApp scopée au workspace si fourni
      let cfgQ = admin.from("whatsapp_config").select("*").eq("is_active", true);
      cfgQ = workspaceId ? cfgQ.eq("workspace_id", workspaceId) : cfgQ.eq("owner_id", user.id).is("workspace_id", null);
      const { data: config } = await cfgQ.maybeSingle();
      if (!config) return json({ error: "WhatsApp non configuré" }, 400);

      const url = `${GRAPH}/${config.business_account_id}/message_templates?limit=100`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${config.access_token}` } });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "Erreur Meta API", details: data }, 400);

      const fetched = (data.data || []) as any[];
      let upserted = 0;
      for (const t of fetched) {
        const bodyComp = (t.components || []).find((c: any) => c.type === "BODY");
        const bodyText = bodyComp?.text || "";
        const varsCount = countVariables(bodyText);
        const { error: upErr } = await admin
          .from("whatsapp_templates")
          .upsert({
            owner_id: user.id,
            workspace_id: workspaceId,
            name: t.name,
            language: t.language,
            category: t.category,
            body_text: bodyText,
            variables_count: varsCount,
            status: t.status,
            is_synced: true,
            meta_template_id: t.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "owner_id,name,language" });
        if (!upErr) upserted++;
      }
      return json({ success: true, count: upserted, total: fetched.length });
    }

    if (action === "create_local") {
      const { name, language, body_text, category } = body;
      if (!name || !body_text) return json({ error: "name et body_text requis" }, 400);
      const { data, error } = await admin
        .from("whatsapp_templates")
        .insert({
          owner_id: user.id,
          workspace_id: workspaceId,
          name,
          language: language || "fr",
          category: category || "MARKETING",
          body_text,
          variables_count: countVariables(body_text),
          status: "MANUAL",
          is_synced: false,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ template: data });
    }

    if (action === "update") {
      const { id, body_text, name, language, category } = body;
      if (!id) return json({ error: "id requis" }, 400);
      const patch: any = { updated_at: new Date().toISOString() };
      if (body_text !== undefined) {
        patch.body_text = body_text;
        patch.variables_count = countVariables(body_text);
      }
      if (name !== undefined) patch.name = name;
      if (language !== undefined) patch.language = language;
      if (category !== undefined) patch.category = category;
      let q = admin.from("whatsapp_templates").update(patch).eq("id", id);
      q = scopeQuery(q);
      const { data, error } = await q.select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ template: data });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id requis" }, 400);
      let q = admin.from("whatsapp_templates").delete().eq("id", id);
      q = scopeQuery(q);
      const { error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    console.error("whatsapp-templates-manage error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
