// Détecte les conversations WhatsApp inactives et crée des tâches:
// - reactivation : lead a répondu puis silence > inactivity_threshold_hours
// - template_24h : dernier outbound > 24h sans réponse → bascule template
// - manual_call : escalade appel (lead chaud + 2 relances OU lead engagé silencieux 24h+)
// Envoie aussi des push notifs critiques à l'owner.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function pushNotif(userId: string, title: string, body: string, leadId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        user_id: userId,
        title,
        body,
        url: `/leads/${leadId}`,
        tag: `inactive-${leadId}`.slice(0, 32),
      }),
    });
  } catch (e) {
    console.error("push notif failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const now = new Date();
    const created: any[] = [];

    // Récupère tous les owners avec automation activée
    const { data: settingsList } = await admin
      .from("followup_automation_settings")
      .select("*")
      .eq("is_enabled", true);

    for (const s of settingsList ?? []) {
      const inactivityHours = s.inactivity_threshold_hours ?? 12;
      const inactivityCutoff = new Date(now.getTime() - inactivityHours * 3600 * 1000);
      const window24hCutoff = new Date(now.getTime() - 24 * 3600 * 1000);

      // Récupère les états de conversation engagés (au moins 1 inbound) et non clos
      // Scope : par workspace si dispo (settings.workspace_id), sinon par owner legacy
      let stateQuery = admin
        .from("lead_conversation_state")
        .select("lead_id, owner_id, state, last_inbound_at, last_outbound_at, workspace_id")
        .not("last_inbound_at", "is", null)
        .not("state", "in", "(BOOKED,CLOSED)");
      if (s.workspace_id) {
        stateQuery = stateQuery.eq("workspace_id", s.workspace_id);
      } else {
        stateQuery = stateQuery.eq("owner_id", s.owner_id).is("workspace_id", null);
      }
      const { data: states } = await stateQuery;

      for (const st of states ?? []) {
        const lastIn = st.last_inbound_at ? new Date(st.last_inbound_at) : null;
        const lastOut = st.last_outbound_at ? new Date(st.last_outbound_at) : null;
        const lastActivity = new Date(
          Math.max(lastIn?.getTime() ?? 0, lastOut?.getTime() ?? 0),
        );

        // Récupère lead pour le score
        const { data: lead } = await admin
          .from("leads")
          .select("id, name, score, phone")
          .eq("id", st.lead_id)
          .single();
        if (!lead) continue;

        // === CAS 1 : conversation inactive (silence > seuil, dans fenêtre 24h) ===
        // Déclenchée si : on a engagé (au moins 1 inbound) ET silence > seuil ET fenêtre 24h pas expirée
        // On couvre 2 sous-cas :
        //  a) dernier msg = nous → le lead n'a pas répondu à notre dernière question
        //  b) dernier msg = lead → on n'a pas relancé après sa réponse
        const lastIsOutbound = (lastOut?.getTime() ?? 0) >= (lastIn?.getTime() ?? 0);
        if (
          lastActivity < inactivityCutoff &&
          lastActivity > window24hCutoff
        ) {
          // Vérifie qu'on n'a pas déjà une tâche active
          const { data: existing } = await admin
            .from("lead_followup_tasks")
            .select("id")
            .eq("lead_id", st.lead_id)
            .eq("task_type", "reactivation")
            .in("status", ["pending", "scheduled"])
            .limit(1);

          // Anti-spam : ne pas relancer en boucle. Si une reactivation a déjà été envoyée
          // ET que le lead n'a pas répondu depuis, on s'arrête (max 1 réactivation tant qu'il ne répond pas).
          const { data: lastSentReact } = await admin
            .from("lead_followup_tasks")
            .select("executed_at")
            .eq("lead_id", st.lead_id)
            .eq("task_type", "reactivation")
            .eq("status", "sent")
            .order("executed_at", { ascending: false })
            .limit(1);
          const lastReactSentAt = lastSentReact?.[0]?.executed_at ? new Date(lastSentReact[0].executed_at) : null;
          const leadRepliedAfterLastReact = lastReactSentAt && lastIn && lastIn.getTime() > lastReactSentAt.getTime();
          const blockedByPrevReact = lastReactSentAt && !leadRepliedAfterLastReact;

          if (!existing?.length && !blockedByPrevReact) {
            const { data: t } = await admin
              .from("lead_followup_tasks")
              .insert({
                lead_id: st.lead_id,
                owner_id: s.owner_id,
                task_type: "reactivation",
                status: "scheduled",
                scheduled_at: now.toISOString(),
                step_order: 50,
              })
              .select("id")
              .single();
            created.push({ type: "reactivation", lead_id: st.lead_id, task_id: t?.id });
            await pushNotif(
              s.owner_id,
              `🔄 Relancer ${lead.name}`,
              `Conversation inactive depuis ${inactivityHours}h`,
              st.lead_id,
            );
          }
        }

        // === CAS 2 : fenêtre 24h expirée → template_24h auto ===
        if (
          s.enable_24h_template_switch &&
          lastActivity < window24hCutoff &&
          s.template_reactivation_id
        ) {
          const { data: existing } = await admin
            .from("lead_followup_tasks")
            .select("id")
            .eq("lead_id", st.lead_id)
            .eq("task_type", "template_24h")
            .in("status", ["pending", "scheduled", "sent"])
            .limit(1);

          if (!existing?.length) {
            const { data: t } = await admin
              .from("lead_followup_tasks")
              .insert({
                lead_id: st.lead_id,
                owner_id: s.owner_id,
                task_type: "template_24h",
                status: "scheduled",
                scheduled_at: now.toISOString(),
                step_order: 60,
              })
              .select("id")
              .single();
            created.push({ type: "template_24h", lead_id: st.lead_id, task_id: t?.id });
          }
        }

        // === CAS 3 : escalade appel manuel ===
        if (s.enable_call_escalation) {
          // 3a — lead chaud + au moins 2 relances envoyées sans réponse récente
          const { count: relancesCount } = await admin
            .from("lead_followup_tasks")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", st.lead_id)
            .eq("status", "sent")
            .in("task_type", ["followup_1", "followup_2", "last_followup", "reactivation"]);

          // 3b — lead engagé qui stoppe (silence 24h+ après avoir répondu)
          const engagedSilent =
            lastIn && lastActivity < window24hCutoff;

          const isHotEscalation = lead.score === "hot" && (relancesCount ?? 0) >= 2;

          if (isHotEscalation || engagedSilent) {
            const { data: existing } = await admin
              .from("lead_followup_tasks")
              .select("id")
              .eq("lead_id", st.lead_id)
              .eq("task_type", "manual_call")
              .in("status", ["pending", "scheduled"])
              .limit(1);

            if (!existing?.length) {
              const { data: t } = await admin
                .from("lead_followup_tasks")
                .insert({
                  lead_id: st.lead_id,
                  owner_id: s.owner_id,
                  task_type: "manual_call",
                  status: "pending", // pending = action humaine requise
                  scheduled_at: now.toISOString(),
                  step_order: 70,
                  message_content: isHotEscalation
                    ? `🔥 Lead chaud sans réponse après 2 relances — appeler ${lead.phone ?? ""}`
                    : `📞 Lead engagé silencieux 24h+ — appel ou vocal WhatsApp`,
                })
                .select("id")
                .single();
              created.push({ type: "manual_call", lead_id: st.lead_id, task_id: t?.id });

              // Crée aussi un rappel CRM standard
              await admin.from("reminders").insert({
                lead_id: st.lead_id,
                owner_id: s.owner_id,
                action: isHotEscalation
                  ? `🔥 Appeler ${lead.name} (lead chaud + 2 relances)`
                  : `📞 Relancer ${lead.name} par téléphone (engagé puis silencieux)`,
                due_date: now.toISOString(),
              });

              await pushNotif(
                s.owner_id,
                `📞 Appel manuel — ${lead.name}`,
                isHotEscalation ? "Lead chaud sans réponse" : "Engagé puis silencieux 24h+",
                st.lead_id,
              );
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, created_count: created.length, created, ran_at: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("detect-inactive error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
