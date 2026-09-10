// Sends a test email using a workspace's own SMTP settings (owner-only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId, to } = await req.json().catch(() => ({}));
    if (!workspaceId || !to) return json({ error: "workspaceId and to required" }, 400);

    const { data: isOwner } = await admin.rpc("is_workspace_owner", {
      _workspace_id: workspaceId,
      _user_id: user.id,
    });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isOwner && !isAdmin) return json({ error: "Forbidden" }, 403);

    const { data: cfg } = await admin
      .from("workspace_smtp_settings")
      .select("enabled, host, port, username, from_email, from_name, password")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const c = cfg as any;
    const usesWorkspace = !!(c && c.enabled && c.host && c.username && c.password);

    const html = usesWorkspace
      ? `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="margin:0 0 12px">Test d'envoi réussi ✅</h2>
      <p style="font-size:14px;line-height:1.6">Cet email a été envoyé avec les réglages SMTP de ce workspace.</p>
      <p style="font-size:13px;color:#6b7280">Serveur : ${c.host}:${c.port} — Expéditeur : ${c.from_email || c.username}</p>
    </div>`
      : `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="margin:0 0 12px">Test d'envoi réussi ✅</h2>
      <p style="font-size:14px;line-height:1.6">Cet email a été envoyé avec l'expéditeur par défaut (aucun réglage propre à cet espace).</p>
    </div>`;

    const { data, error } = await admin.functions.invoke("send-smtp-email", {
      body: { to: [String(to)], subject: "Test SMTP du workspace", html, workspaceId },
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (error) {
      let detail = error.message;
      try { detail = (await (error as any).context?.json?.())?.error || detail; } catch { /* ignore */ }
      return json({ error: detail }, 500);
    }
    if ((data as any)?.error) return json({ error: (data as any).error }, 500);

    return json({ ok: true, workspaceSmtp: (data as any)?.workspaceSmtp === true, sender: (data as any)?.sender });
  } catch (e) {
    console.error("[workspace-smtp-test]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
