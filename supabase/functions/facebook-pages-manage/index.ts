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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const pageId = body.page_id as string | undefined;
    const workspace_id = (body.workspace_id as string | undefined) || null;

    // Verify workspace membership when provided
    if (workspace_id) {
      const { data: isMember } = await admin.rpc("is_workspace_member", {
        _workspace_id: workspace_id,
        _user_id: user.id,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Apply workspace scoping (or legacy: owner only, no workspace)
    const scope = (q: any) =>
      workspace_id
        ? q.eq("workspace_id", workspace_id)
        : q.eq("owner_id", user.id).is("workspace_id", null);

    const loadPage = async (id: string) => {
      const { data, error } = await scope(
        admin.from("meta_pages").select("*").eq("page_id", id),
      ).maybeSingle();
      if (error || !data) throw new Error("Page not found");
      return data;
    };

    if (action === "list") {
      const { data, error } = await scope(
        admin
          .from("meta_pages")
          .select("id, page_id, page_name, is_active, subscribed, forms, created_at, updated_at")
          .order("created_at", { ascending: false }),
      );
      if (error) throw error;
      return new Response(JSON.stringify({ pages: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "subscribe" && pageId) {
      const page = await loadPage(pageId);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${page.page_access_token}`,
        { method: "POST" },
      );
      const json = await res.json();
      if (json.success) {
        await admin.from("meta_pages").update({ subscribed: true } as any).eq("id", page.id);
      }
      return new Response(JSON.stringify(json), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unsubscribe" && pageId) {
      const page = await loadPage(pageId);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?access_token=${page.page_access_token}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (json.success) {
        await admin.from("meta_pages").update({ subscribed: false } as any).eq("id", page.id);
      }
      return new Response(JSON.stringify(json), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_forms" && pageId) {
      const page = await loadPage(pageId);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name,status,locale,created_time&access_token=${page.page_access_token}`,
      );
      const json = await res.json();
      const forms = json.data || [];
      await admin.from("meta_pages").update({ forms } as any).eq("id", page.id);
      return new Response(JSON.stringify({ forms }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_active" && pageId) {
      const page = await loadPage(pageId);
      await admin.from("meta_pages").update({ is_active: !page.is_active } as any).eq("id", page.id);
      return new Response(JSON.stringify({ ok: true, is_active: !page.is_active }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete" && pageId) {
      try {
        const page = await loadPage(pageId);
        await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?access_token=${page.page_access_token}`,
          { method: "DELETE" },
        );
        await admin.from("meta_pages").delete().eq("id", page.id);
      } catch (_) { /* ignore */ }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[facebook-pages-manage]", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
