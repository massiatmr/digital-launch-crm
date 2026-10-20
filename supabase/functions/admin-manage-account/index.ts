import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const workspaceId = String(body.workspace_id || "");
    const password = String(body.password || "");
    if (!workspaceId) return json({ error: "Espace manquant" }, 400);
    if (password.length < 8) return json({ error: "Mot de passe : 8 caractères minimum" }, 400);

    const { data: adminRow } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRow;
    const { data: isOwner } = await admin.rpc("is_workspace_owner", { _workspace_id: workspaceId, _user_id: user.id });
    if (!isAdmin && isOwner !== true) return json({ error: "Accès refusé" }, 403);

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = body.name ? String(body.name).trim() : null;
      const role = body.role === "owner" ? "owner" : "member";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email invalide" }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: name ? { full_name: name } : {},
      });
      let uid: string;
      let existing = false;
      if (error || !created?.user) {
        const exists = /already|registered|exists/i.test(error?.message || "");
        if (!exists) return json({ error: "Création impossible" }, 500);
        // Existing account: find it and overwrite its password/name.
        let found: any = null;
        for (let page = 1; page <= 50 && !found; page++) {
          const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (lErr) return json({ error: "Recherche du compte impossible" }, 500);
          found = list.users.find((u) => (u.email || "").toLowerCase() === email);
          if (list.users.length < 1000) break;
        }
        if (!found) return json({ error: "Compte introuvable" }, 404);
        if (found.id === user.id) return json({ error: "Change ton propre mot de passe depuis ton compte" }, 400);
        if (!isAdmin) {
          const { data: targetAdmin } = await admin.from("user_roles").select("role")
            .eq("user_id", found.id).eq("role", "admin").maybeSingle();
          if (targetAdmin) return json({ error: "Accès refusé" }, 403);
          const { data: owned } = await admin.from("workspace_members").select("workspace_id")
            .eq("user_id", found.id).eq("role", "owner");
          for (const w of owned || []) {
            const { data: ok } = await admin.rpc("is_workspace_owner", { _workspace_id: (w as any).workspace_id, _user_id: user.id });
            if (ok !== true) return json({ error: "Accès refusé : ce compte gère un autre espace" }, 403);
          }
        }
        const { error: uErr } = await admin.auth.admin.updateUserById(found.id, {
          password, email_confirm: true,
          user_metadata: name ? { ...(found.user_metadata || {}), full_name: name } : found.user_metadata,
        });
        if (uErr) return json({ error: "Mise à jour du compte impossible" }, 500);
        uid = found.id;
        existing = true;
      } else {
        uid = created.user.id;
      }
      await admin.from("user_roles").upsert({ user_id: uid, role: "user" }, { onConflict: "user_id,role", ignoreDuplicates: true });
      const { error: mErr } = await admin.from("workspace_members")
        .upsert({ workspace_id: workspaceId, user_id: uid, role }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
      if (mErr) return json({ error: "Compte créé mais rattachement échoué" }, 500);
      return json({ success: true, user_id: uid, email });
    }

    if (action === "set_password") {
      const targetId = String(body.user_id || "");
      if (!targetId) return json({ error: "Membre manquant" }, 400);
      if (targetId === user.id) return json({ error: "Change ton propre mot de passe depuis ton compte" }, 400);
      const { data: isMember } = await admin.rpc("is_workspace_member", { _workspace_id: workspaceId, _user_id: targetId });
      if (isMember !== true) return json({ error: "Ce compte n'est pas membre de cet espace" }, 403);
      if (!isAdmin) {
        const { data: targetAdmin } = await admin.from("user_roles").select("role")
          .eq("user_id", targetId).eq("role", "admin").maybeSingle();
        if (targetAdmin) return json({ error: "Accès refusé" }, 403);
        // Target must not own a workspace the caller doesn't own
        const { data: owned } = await admin.from("workspace_members").select("workspace_id")
          .eq("user_id", targetId).eq("role", "owner");
        for (const w of owned || []) {
          const { data: ok } = await admin.rpc("is_workspace_owner", { _workspace_id: (w as any).workspace_id, _user_id: user.id });
          if (ok !== true) return json({ error: "Accès refusé : ce compte gère un autre espace" }, 403);
        }
      }
      const { error } = await admin.auth.admin.updateUserById(targetId, { password, email_confirm: true });
      if (error) return json({ error: "Changement impossible" }, 500);
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (_e) {
    return json({ error: "Erreur interne" }, 500);
  }
});
