// Exécute une tâche de suivi WhatsApp avec mode dry-run et support templates Meta
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    default: return null;
  }
}

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

    const { data: task, error: taskErr } = await admin
      .from("lead_followup_tasks").select("*").eq("id", task_id).maybeSingle();

    if (taskErr || !task) return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (isInternalCron) ownerId = task.owner_id;
    else if (task.owner_id !== ownerId) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (task.status === 'sent' || task.status === 'cancelled') {
      return new Response(JSON.stringify({ error: `Task already ${task.status}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Charger settings (dry_run + mapping templates)
    const { data: settings } = await admin
      .from("followup_automation_settings").select("*").eq("owner_id", ownerId).maybeSingle();
    const dryRun = settings?.dry_run !== false; // default true (sécurité)

    // Charger lead pour variables/contexte
    const { data: lead } = await supabase
      .from("leads").select("*").eq("id", task.lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Déterminer si un template est mappé pour ce type de tâche
    const tplField = templateKey(task.task_type);
    const tplId = tplField && settings ? (settings as any)[tplField] : null;
    let template: any = null;
    if (tplId) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates").select("*").eq("id", tplId).maybeSingle();
      template = tpl;
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
        // Envoi réel via Meta API en mode template
        const { data: config } = await supabase
          .from("whatsapp_config").select("*").eq("owner_id", user.id).maybeSingle();
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
            if (!resp.ok) {
              errorMessage = JSON.stringify(data);
              logStatus = "failed";
            } else {
              waMessageId = data.messages?.[0]?.id || null;
              logStatus = "sent";
            }
          }
        }
      }
    } else {
      // Pas de template mappé → générer message texte via IA
      const genResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-followup-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ lead_id: task.lead_id, task_type: task.task_type }),
      });
      if (!genResp.ok) {
        const errBody = await genResp.text();
        await supabase.from("lead_followup_tasks").update({ status: 'failed', error_message: errBody }).eq("id", task_id);
        return new Response(JSON.stringify({ error: "Failed to generate message", details: errBody }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const genData = await genResp.json();
      messageContent = genData.message;
      aiGenerated = true;
      // En mode dry_run : log only. Sinon : tentative texte libre (souvent bloquée hors fenêtre 24h).
      if (!dryRun) {
        logStatus = "skipped_no_template";
        errorMessage = "Aucun template mappé — envoi texte libre non tenté (fenêtre 24h Meta)";
      }
    }

    // Logger dans whatsapp_messages
    await supabase.from("whatsapp_messages").insert({
      lead_id: task.lead_id,
      owner_id: user.id,
      direction: 'outbound',
      content: messageContent,
      task_id: task_id,
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
    });

    // MAJ tâche
    const newStatus = logStatus === "failed" ? "failed" : (logStatus === "skipped_no_template" ? "skipped" : "sent");
    await supabase.from("lead_followup_tasks").update({
      status: newStatus,
      executed_at: new Date().toISOString(),
      message_content: messageContent,
      ai_generated: aiGenerated,
      error_message: errorMessage,
    }).eq("id", task_id);

    return new Response(JSON.stringify({ success: logStatus !== "failed", message: messageContent, dry_run: dryRun, status: logStatus }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("execute-followup-task error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
