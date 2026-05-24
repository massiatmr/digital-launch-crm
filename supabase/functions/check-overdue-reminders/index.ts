const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Renvoie une notif si une tâche n'est toujours pas cochée X minutes après l'échéance.
// Paliers: 30min, 2h, 24h après due_date. Tag unique par palier pour éviter les doublons.
const OVERDUE_STEPS = [
  { key: "30m", minutes: 30, label: "en retard de 30 min" },
  { key: "2h", minutes: 120, label: "en retard de 2h" },
  { key: "24h", minutes: 1440, label: "en retard de 24h" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  function decodeJwtRole(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload?.role === 'string' ? payload.role : null;
    } catch { return null; }
  }
  const jwtRole = bearer ? decodeJwtRole(bearer) : null;
  const isServiceRole = bearer.length > 0 && (bearer === SUPABASE_SERVICE_ROLE_KEY || jwtRole === 'service_role');
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    // On regarde tous les rappels non faits dont la due_date est passée (max 7 jours en arrière)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: overdue, error } = await supabase
      .from("reminders")
      .select("id, action, due_date, owner_id, lead_id, leads(name)")
      .eq("done", false)
      .lt("due_date", now.toISOString())
      .gte("due_date", sevenDaysAgo.toISOString());

    if (error) throw error;
    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let skipped = 0;

    for (const r of overdue) {
      const due = new Date(r.due_date).getTime();
      const elapsedMin = Math.floor((now.getTime() - due) / 60000);

      // On choisit le palier le plus élevé atteint dans la dernière minute (fenêtre 1 min de tolérance)
      const step = [...OVERDUE_STEPS]
        .reverse()
        .find((s) => elapsedMin >= s.minutes && elapsedMin < s.minutes + 5);

      if (!step) {
        skipped++;
        continue;
      }

      const leadName = (r.leads as any)?.name || "Lead";
      const tag = `overdue-${r.id}-${step.key}`.slice(0, 32);

      const pushResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: r.owner_id,
          title: `⚠️ Tâche ${step.label} — ${leadName}`,
          body: r.action,
          url: `/reminders?highlight=${r.id}`,
          tag,
        }),
      });

      const txt = await pushResponse.text();
      if (pushResponse.ok) {
        sent++;
        console.log(`Overdue push (${step.key}) for ${r.id}: ${txt}`);
      } else {
        console.error(`Overdue push failed for ${r.id}:`, txt);
      }
    }

    return new Response(JSON.stringify({ processed: overdue.length, sent, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-overdue-reminders error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
