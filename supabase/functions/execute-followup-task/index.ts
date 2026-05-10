// Exécute une tâche de suivi WhatsApp avec mode dry-run et support templates Meta
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p.replace(/^\+/, "");
}

function templateKey(taskType: string): string | null {
  switch (taskType) {
    case "initial_message": return "template_initial_id";
    case "followup_1": return "template_followup_1_id";
    case "followup_2": return "template_followup_2_id";
    case "last_followup": return "template_last_followup_id";
    case "template_24h": return "template_reactivation_id";
    default: return null;
  }
}

// Tâches qui ne déclenchent PAS d'envoi auto (action humaine requise)
const HUMAN_TASK_TYPES = new Set(["manual_call"]);

async function generateVariablesWithAI(template: any, lead: any, apiKey: string): Promise<string[]> {
  if (template.variables_count === 0) return [];
  const prompt = `Tu génères les variables d'un template WhatsApp.

Template: "${template.body_text}"
Nombre de variables à générer: ${template.variables_count}

Lead:
- Nom: ${lead.name}
- Entreprise: ${lead.company_name || "-"}
- Message initial: ${lead.message || "-"}
- Notes: ${lead.notes || "-"}

Réponds UNIQUEMENT avec un JSON: {"variables": ["valeur1", "valeur2", ...]}
Les valeurs doivent être courtes (1-3 mots), en français, naturelles.`;

  const resp = await fetch(LOVABLE_AI, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`AI variables gen failed: ${await resp.text()}`);
  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.variables || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const isInternalCron = req.headers.get("x-internal-cron") === "1";
    if (!authHeader && !isInternalCron) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Service-role client (used for cron + reading settings) and a per-user client (when invoked from UI)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabase = isInternalCron
      ? admin
      : createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader! } } }
        );

    const { task_id, custom_message, owner_id: bodyOwnerId } = await req.json();
    if (!task_id) return new Response(JSON.stringify({ error: "Missing task_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let ownerId: string | null = null;
    if (!isInternalCron) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      ownerId = user.id;
    }

    // === LOCK ANTI-DOUBLON ATOMIQUE ===
    // On claim la tâche en la passant à 'processing' uniquement si elle est encore 'scheduled' ou 'pending'.
    // Si une autre exécution concurrente l'a déjà claim, l'UPDATE retourne 0 ligne → on abort proprement.
    const { data: claimed, error: claimErr } = await admin
      .from("lead_followup_tasks")
      .update({ status: "processing", updated_at: new Date().toISOString() } as any)
      .eq("id", task_id)
      .in("status", ["scheduled", "pending"])
      .select("*")
      .maybeSingle();

    if (claimErr) {
      return new Response(JSON.stringify({ error: "Claim failed", details: claimErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!claimed) {
      // Soit la tâche n'existe pas, soit elle a déjà été claim (sent/cancelled/processing/failed)
      const { data: existing } = await admin.from("lead_followup_tasks").select("status").eq("id", task_id).maybeSingle();
      if (!existing) return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: `already_${existing.status}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const task = claimed;

    if (isInternalCron) ownerId = task.owner_id;
    else if (task.owner_id !== ownerId) {
      // Rollback du lock si forbidden
      await admin.from("lead_followup_tasks").update({ status: "scheduled" } as any).eq("id", task_id);
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Tâches manuelles (appel) : ne rien envoyer, marquer 'pending' (à faire par l'humain dans le CRM)
    if (HUMAN_TASK_TYPES.has(task.task_type)) {
      await admin.from("lead_followup_tasks").update({ status: "pending" } as any).eq("id", task_id);
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "Tâche humaine — aucun envoi automatique. Action requise dans le CRM.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Charger lead pour variables/contexte (avant settings → on a besoin de workspace_id)
    const { data: lead } = await supabase
      .from("leads").select("*").eq("id", task.lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: conversationState }, { data: activeBooking }] = await Promise.all([
      admin.from("lead_conversation_state").select("state, automation_paused_at, snoozed_until, resolved_at").eq("lead_id", task.lead_id).maybeSingle(),
      admin
        .from("bookings")
        .select("id")
        .eq("lead_id", task.lead_id)
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);
    if (conversationState?.state === "BOOKED" || activeBooking) {
      await admin.from("lead_followup_tasks").update({
        status: "cancelled",
        error_message: activeBooking ? `Skipped: booking already exists (${activeBooking.id})` : "Skipped: conversation already booked",
        updated_at: new Date().toISOString(),
      } as any).eq("id", task_id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_booked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filet de sécurité : automation manuellement pausée, conv snoozée ou résolue → skip
    const nowMs = Date.now();
    const isSnoozed = conversationState?.snoozed_until && new Date(conversationState.snoozed_until).getTime() > nowMs;
    const isPaused = !!conversationState?.automation_paused_at;
    const isResolved = !!conversationState?.resolved_at;
    if (isPaused || isSnoozed || isResolved) {
      const reason = isPaused ? "automation_paused" : isSnoozed ? "snoozed" : "resolved";
      // On garde la tâche en scheduled si snoozée (elle pourra repartir après), sinon cancel
      if (isSnoozed) {
        const newDate = new Date(new Date(conversationState!.snoozed_until!).getTime() + 5 * 60 * 1000).toISOString();
        await admin.from("lead_followup_tasks").update({
          scheduled_at: newDate,
          updated_at: new Date().toISOString(),
        } as any).eq("id", task_id);
      } else {
        await admin.from("lead_followup_tasks").update({
          status: "cancelled",
          error_message: `Skipped: ${reason}`,
          updated_at: new Date().toISOString(),
        } as any).eq("id", task_id);
      }
      return new Response(JSON.stringify({ ok: true, skipped: true, reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Charger settings (dry_run + mapping templates) — par workspace si possible, fallback owner legacy
    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await admin
        .from("followup_automation_settings").select("*").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await admin
        .from("followup_automation_settings").select("*").eq("owner_id", ownerId).is("workspace_id", null).maybeSingle();
      settings = data;
    }
    const dryRun = settings?.dry_run !== false; // default true (sécurité)

    // === STOP INTELLIGENT ===
    // 1. Skip si lead lost/won
    if (lead.status === "lost" || lead.status === "won") {
      await admin.from("lead_followup_tasks").update({
        status: "cancelled",
        error_message: `Skipped: lead status=${lead.status}`,
      } as any).eq("id", task_id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: `lead ${lead.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Check qualification : reporter si "pas le bon moment" récent
    const { data: qualif } = await admin
      .from("lead_qualification").select("*").eq("lead_id", task.lead_id).maybeSingle();
    if (qualif) {
      const objs: string[] = qualif.objections ?? [];
      const hasBadTiming = objs.some((o) => /pas le bon moment|trop tôt|plus tard|recontacter/i.test(o));
      if (hasBadTiming && qualif.last_qualified_at) {
        const daysSince = (Date.now() - new Date(qualif.last_qualified_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          const newDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          await admin.from("lead_followup_tasks").update({
            scheduled_at: newDate,
            error_message: "Reporté +14j (objection 'mauvais moment' < 7j)",
          } as any).eq("id", task_id);
          return new Response(JSON.stringify({ ok: true, deferred: true, new_date: newDate }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // Si auto-stop activé et lead détecté pas intéressé → annule
      if (settings?.auto_stop_on_not_interested !== false &&
          (qualif.intent === "not_interested" || qualif.intent === "wrong_person")) {
        await admin.from("lead_followup_tasks").update({
          status: "cancelled",
          error_message: `Auto-stop: intent=${qualif.intent}`,
        } as any).eq("id", task_id);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: qualif.intent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Escalade : 3+ relances sent consécutives sans aucun inbound après → pause + alerte
    const { count: outboundCount } = await admin
      .from("lead_followup_tasks").select("id", { count: "exact", head: true })
      .eq("lead_id", task.lead_id).eq("status", "sent")
      .in("task_type", ["followup_1", "followup_2", "last_followup", "reactivation"]);
    const { count: inboundCount } = await admin
      .from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("lead_id", task.lead_id).eq("direction", "inbound");
    if ((outboundCount ?? 0) >= 3 && (inboundCount ?? 0) === 0) {
      await admin.from("lead_followup_tasks").update({
        status: "cancelled",
        error_message: "Pause auto : 3 relances sans aucune réponse",
      } as any).eq("id", task_id);
      // Annule aussi les tâches futures non-manuelles
      await admin.from("lead_followup_tasks").update({ status: "cancelled" } as any)
        .eq("lead_id", task.lead_id).in("status", ["pending", "scheduled"])
        .neq("task_type", "manual_call");
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "auto_pause_3_no_reply" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Anti-flood : si un outbound a été envoyé dans les 60 dernières secondes pour ce lead
    // (par une autre tâche), on annule celle-ci pour éviter les doublons. Cas typique :
    // webhook Meta retry → 2 qualify-conversation → 2 propose_meeting tasks créées en race.
    const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentOutbound } = await admin
      .from("whatsapp_messages")
      .select("id, task_id, sent_at")
      .eq("lead_id", task.lead_id)
      .eq("direction", "outbound")
      .gte("sent_at", sixtySecAgo)
      .neq("task_id", task_id)
      .limit(1);
    if (recentOutbound && recentOutbound.length > 0) {
      await admin.from("lead_followup_tasks").update({
        status: "cancelled",
        error_message: "Skipped: outbound récent (<60s) pour ce lead (anti-doublon)",
        updated_at: new Date().toISOString(),
      } as any).eq("id", task_id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "recent_outbound_cooldown" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper : récupère la config WhatsApp ACTIVE scopée au workspace du lead
    // (sinon fallback sur l'owner_id si lead sans workspace — legacy)
    const getActiveWaConfig = async () => {
      if (lead.workspace_id) {
        const { data } = await admin
          .from("whatsapp_config")
          .select("*")
          .eq("workspace_id", lead.workspace_id)
          .eq("is_active", true)
          .maybeSingle();
        return data;
      }
      const { data } = await admin
        .from("whatsapp_config")
        .select("*")
        .eq("owner_id", ownerId)
        .is("workspace_id", null)
        .maybeSingle();
      return data;
    };

    // Déterminer si un template est mappé pour ce type de tâche
    // PRIORITÉ 1 : followup_sequence_steps (séquence dynamique configurée par l'owner)
    // PRIORITÉ 2 : followup_automation_settings.template_xxx_id (legacy)
    let tplId: string | null = null;

    // Lookup séquence dynamique : par workspace si dispo, sinon par owner
    let stepQuery = admin
      .from("followup_sequence_steps")
      .select("template_id")
      .eq("task_type", task.task_type)
      .eq("step_order", task.step_order)
      .eq("is_enabled", true);
    if (lead.workspace_id) {
      stepQuery = stepQuery.eq("workspace_id", lead.workspace_id);
    } else {
      stepQuery = stepQuery.eq("owner_id", ownerId).is("workspace_id", null);
    }
    const { data: stepRow } = await stepQuery.maybeSingle();
    if (stepRow?.template_id) {
      tplId = stepRow.template_id;
    } else {
      // Fallback legacy : si task_type matche un step_order différent, on tente sans step_order
      let fallbackStep = admin
        .from("followup_sequence_steps")
        .select("template_id")
        .eq("task_type", task.task_type)
        .eq("is_enabled", true);
      if (lead.workspace_id) fallbackStep = fallbackStep.eq("workspace_id", lead.workspace_id);
      else fallbackStep = fallbackStep.eq("owner_id", ownerId).is("workspace_id", null);
      const { data: fb } = await fallbackStep.order("step_order", { ascending: true }).limit(1).maybeSingle();
      if (fb?.template_id) tplId = fb.template_id;
    }

    // Fallback final : champs legacy dans followup_automation_settings
    if (!tplId) {
      const tplField = templateKey(task.task_type);
      tplId = tplField && settings ? (settings as any)[tplField] : null;
    }

    let template: any = null;
    if (tplId) {
      const { data: tpl } = await admin
        .from("whatsapp_templates").select("*").eq("id", tplId).maybeSingle();
      template = tpl;
    }

    // Si le lead a déjà initié/répondu sur WhatsApp (conversation ouverte),
    // on ignore le template et on envoie un message texte libre généré par IA
    // (fenêtre 24h Meta ouverte, plus pertinent et plus humain qu'un template).
    if (template && (inboundCount ?? 0) > 0) {
      template = null;
    }

    let messageContent = custom_message || task.message_content;
    let aiGenerated = false;
    let logStatus = dryRun ? "dry_run" : "sent";
    let waMessageId: string | null = null;
    let errorMessage: string | null = null;

    // Mode édition manuelle (custom_message fourni) → on envoie texte libre
    // Sinon : si template mappé, on envoie template. Sinon, on génère via IA.
    if (custom_message) {
      messageContent = custom_message;
      // Envoi texte libre (uniquement si lead a répondu — sinon Meta refusera)
    } else if (template) {
      // Construire preview du message rempli
      const variables = await generateVariablesWithAI(template, lead, Deno.env.get("LOVABLE_API_KEY")!);
      let preview = template.body_text;
      variables.forEach((v, i) => { preview = preview.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v); });
      messageContent = preview;
      aiGenerated = template.variables_count > 0;

      if (!dryRun) {
        const config = await getActiveWaConfig();
        if (!config) {
          errorMessage = "WhatsApp non configuré";
          logStatus = "failed";
        } else {
          const phone = normalizePhone(lead.phone);
          if (!phone) {
            errorMessage = "Téléphone du lead invalide";
            logStatus = "failed";
          } else {
            const components = template.variables_count > 0 ? [{
              type: "body",
              parameters: variables.map((v) => ({ type: "text", text: v })),
            }] : [];
            const payload = {
              messaging_product: "whatsapp",
              to: phone,
              type: "template",
              template: {
                name: template.name,
                language: { code: template.language },
                ...(components.length ? { components } : {}),
              },
            };
            const resp = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!resp.ok) { errorMessage = JSON.stringify(data); logStatus = "failed"; }
            else { waMessageId = data.messages?.[0]?.id || null; logStatus = "sent"; }
          }
        }
      }
    } else {
      const genResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-followup-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: isInternalCron ? `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` : authHeader!,
          ...(isInternalCron ? { "x-internal-cron": "1", "x-owner-id": ownerId! } : {}),
        },
        body: JSON.stringify({ lead_id: task.lead_id, task_type: task.task_type, variant: task.message_variant ?? (settings?.enable_ab_test ? (Math.random() < 0.5 ? "A" : "B") : undefined) }),
      });
      if (!genResp.ok) {
        const errBody = await genResp.text();
        await admin.from("lead_followup_tasks").update({ status: 'failed', error_message: errBody } as any).eq("id", task_id);
        return new Response(JSON.stringify({ error: "Failed to generate message", details: errBody }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const genData = await genResp.json();
      messageContent = genData.message;
      aiGenerated = true;

      // Vérifier si la fenêtre 24h Meta est ouverte (lead a répondu au moins une fois)
      const { data: lastInbound } = await admin
        .from("whatsapp_messages")
        .select("sent_at")
        .eq("lead_id", task.lead_id)
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const windowOpen = lastInbound && (Date.now() - new Date(lastInbound.sent_at).getTime() < 24 * 60 * 60 * 1000);

      if (!dryRun) {
        if (!windowOpen) {
          logStatus = "skipped_no_template";
          errorMessage = "Aucun template mappé et fenêtre 24h fermée — Meta refuse le texte libre. Mappe un template ou attends une réponse du lead.";
        } else {
          // Envoi texte libre autorisé
          const config = await getActiveWaConfig();
          if (!config) {
            errorMessage = "WhatsApp non configuré";
            logStatus = "failed";
          } else {
            const phone = normalizePhone(lead.phone);
            if (!phone) {
              errorMessage = "Téléphone du lead invalide";
              logStatus = "failed";
            } else {
              const resp = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
                method: "POST",
                headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: phone,
                  type: "text",
                  text: { body: messageContent },
                }),
              });
              const data = await resp.json();
              if (!resp.ok) { errorMessage = JSON.stringify(data); logStatus = "failed"; }
              else { waMessageId = data.messages?.[0]?.id || null; logStatus = "sent"; }
            }
          }
        }
      }
    }

    const { error: insertErr } = await admin.from("whatsapp_messages").insert({
      lead_id: task.lead_id,
      owner_id: ownerId,
      workspace_id: lead.workspace_id ?? null,
      direction: 'outbound',
      content: messageContent,
      task_id: task_id,
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
    } as any);

    // Anti-doublon : si l'index unique whatsapp_messages_unique_outbound_task rejette l'insert,
    // c'est qu'un message a déjà été envoyé pour cette tâche (race condition).
    // On marque la tâche 'sent' (pour éviter qu'elle reste en 'processing') et on stoppe ici.
    if (insertErr && (insertErr as any).code === "23505") {
      await admin.from("lead_followup_tasks").update({
        status: "sent",
        executed_at: new Date().toISOString(),
        error_message: "Skipped: message already sent for this task (DB unique constraint)",
        updated_at: new Date().toISOString(),
      } as any).eq("id", task_id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_message_blocked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (insertErr) {
      console.error("whatsapp_messages insert error", insertErr);
    }

    const newStatus = logStatus === "failed" ? "failed" : (logStatus === "skipped_no_template" ? "skipped" : "sent");
    await admin.from("lead_followup_tasks").update({
      status: newStatus,
      executed_at: new Date().toISOString(),
      message_content: messageContent,
      ai_generated: aiGenerated,
      error_message: errorMessage,
    } as any).eq("id", task_id);

    // Au premier outbound réussi (sent ou dry_run), basculer le lead "new" → "contacted"
    if ((logStatus === "sent" || logStatus === "dry_run") && lead.status === "new") {
      await admin.from("leads").update({ status: "contacted" } as any).eq("id", task.lead_id);
    }

    // Prise de notes IA : à chaque échange en qualification, mettre à jour les notes du lead
    // pour préparer l'appel commercial (besoin, budget, urgence, signaux, objections)
    if (
      (logStatus === "sent" || logStatus === "dry_run") &&
      task.task_type === "qualification"
    ) {
      try {
        const { data: history } = await admin
          .from("whatsapp_messages")
          .select("direction, content, sent_at")
          .eq("lead_id", task.lead_id)
          .order("sent_at", { ascending: true })
          .limit(30);

        const transcript = (history || [])
          .map((m: any) => `[${m.direction === "inbound" ? "LEAD" : "MOI"}] ${m.content}`)
          .join("\n");

        const notesPrompt = `Tu es l'assistant commercial. Analyse la conversation WhatsApp ci-dessous et produis des NOTES DE PRÉPARATION D'APPEL synthétiques en français.

Contexte lead :
- Nom : ${lead.name}
- Entreprise : ${lead.company_name || "-"}
- Message initial : ${lead.message || "-"}
- Notes manuelles existantes : ${(lead.notes || "").replace(/<!-- AI_NOTES_START -->[\s\S]*?<!-- AI_NOTES_END -->/, "").trim() || "(aucune)"}

Conversation WhatsApp :
${transcript || "(aucun échange)"}

Produis des notes COURTES et ACTIONNABLES sous ce format markdown EXACT (omet une section si aucune info) :

## 🎯 Besoin
- ...

## 💰 Budget
- ...

## ⏱️ Urgence / Timing
- ...

## 🚨 Objections / Freins
- ...

## ✨ Signaux d'achat
- ...

## 📞 Stratégie pour l'appel
- ...

Règles :
- Va à l'essentiel, pas de blabla
- Si une info manque, n'invente rien — omet la section
- Maximum 2-3 puces par section
- Ton pro, prêt à l'emploi pour un call`;

        const notesResp = await fetch(LOVABLE_AI, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
          },
          body: JSON.stringify({
            model: settings?.ai_model || "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: notesPrompt }],
          }),
        });

        if (notesResp.ok) {
          const notesData = await notesResp.json();
          const aiNotes = notesData.choices?.[0]?.message?.content?.trim();
          if (aiNotes) {
            const stamp = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
            const block = `<!-- AI_NOTES_START -->\n_🤖 Notes IA mises à jour le ${stamp}_\n\n${aiNotes}\n<!-- AI_NOTES_END -->`;
            const existing = lead.notes || "";
            const blockRegex = /<!-- AI_NOTES_START -->[\s\S]*?<!-- AI_NOTES_END -->/;
            const newNotes = blockRegex.test(existing)
              ? existing.replace(blockRegex, block)
              : (existing.trim() ? existing.trim() + "\n\n" + block : block);
            await admin.from("leads").update({ notes: newNotes } as any).eq("id", task.lead_id);
          }
        } else {
          console.warn("AI notes generation failed", await notesResp.text());
        }
      } catch (notesErr) {
        console.error("AI notes update error", notesErr);
      }
    }

    return new Response(JSON.stringify({ success: logStatus !== "failed", message: messageContent, dry_run: dryRun, status: logStatus }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("execute-followup-task error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
