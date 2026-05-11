// Analyse une conversation WhatsApp : extrait BANT-light, classe l'intention, déclenche actions auto.
// Appelée par whatsapp-webhook (fire-and-forget) après chaque inbound.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only endpoint: must be called with the service role key (server-to-server).
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer !== SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: lead } = await admin
      .from("leads")
      .select("id, owner_id, workspace_id, name, status, message")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Settings (pour modèle + prompt custom)
    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await admin.from("followup_automation_settings").select("*").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await admin.from("followup_automation_settings").select("*").eq("owner_id", lead.owner_id).is("workspace_id", null).maybeSingle();
      settings = data;
    }

    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("id, direction, content, sent_at")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(15);

    const ordered = (history ?? []).reverse();
    const transcript = ordered.map((m: any) => `[${m.direction === "inbound" ? "LEAD" : "MOI"}] ${m.content}`).join("\n");
    const lastInbound = ordered.filter((m: any) => m.direction === "inbound").slice(-1)[0];

    const systemPrompt = `Tu es un analyste commercial. Analyse une conversation WhatsApp et retourne UN SEUL objet JSON via l'outil "save_qualification".

Schéma:
- pain_point: 1 phrase courte décrivant le problème principal du lead (vide si inconnu)
- urgency: "immediate" | "weeks" | "months" | "unclear"
- budget_signal: "yes" | "no" | "unknown" (yes = signe que le budget existe)
- decision_maker: "yes" | "no" | "unknown"
- objections: tableau de strings (objections explicitement formulées : "trop cher", "pas le bon moment", "déjà un prestataire", etc.)
- interest_level: 0-100 (0 = veut être laissé tranquille, 100 = prêt à signer)
- intent: "ready_to_book" | "confirms_slot" | "objection" | "not_interested" | "info_request" | "wrong_person" | "qualification_in_progress" | "unknown"
  • ready_to_book = lead demande un créneau/lien/RDV pour la PREMIÈRE fois OU refuse les créneaux proposés et en redemande d'autres
  • confirms_slot = MOI ai proposé un ou plusieurs créneaux dans les messages précédents ET le lead vient d'en accepter UN explicitement (ex: "ok pour mardi 14h", "parfait le 15 à 11h", "ça marche pour le premier", "oui ce créneau")
  • not_interested = "non merci", "stop", "pas intéressé", "ne me contactez plus"
  • wrong_person = "ce n'est pas moi", "mauvais numéro"
- summary: 1-2 phrases résumant l'état actuel pour préparer la prochaine réponse

Sois STRICT : si le lead n'a rien dit clairement, mets "unknown" / "unclear" / 0.
IMPORTANT pour confirms_slot : le créneau accepté doit avoir été PROPOSÉ par MOI auparavant. Si le lead propose lui-même un créneau pour la première fois, c'est ready_to_book, pas confirms_slot.`;

    const userPrompt = `Lead : ${lead.name}
Message initial du formulaire : ${lead.message || "(aucun)"}
Statut CRM actuel : ${lead.status}

Conversation WhatsApp (ordre chronologique) :
${transcript || "(aucun message)"}

Analyse maintenant.`;

    const aiRes = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_qualification",
            description: "Sauvegarde la qualification structurée du lead.",
            parameters: {
              type: "object",
              properties: {
                pain_point: { type: "string" },
                urgency: { type: "string", enum: ["immediate", "weeks", "months", "unclear"] },
                budget_signal: { type: "string", enum: ["yes", "no", "unknown"] },
                decision_maker: { type: "string", enum: ["yes", "no", "unknown"] },
                objections: { type: "array", items: { type: "string" } },
                interest_level: { type: "integer", minimum: 0, maximum: 100 },
                intent: { type: "string", enum: ["ready_to_book", "confirms_slot", "objection", "not_interested", "info_request", "wrong_person", "qualification_in_progress", "unknown"] },
                summary: { type: "string" },
              },
              required: ["pain_point", "urgency", "budget_signal", "decision_maker", "objections", "interest_level", "intent", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_qualification" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI failed", details: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No tool call returned" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const q = JSON.parse(toolCall.function.arguments);

    // Upsert qualification
    await admin.from("lead_qualification").upsert({
      lead_id,
      owner_id: lead.owner_id,
      workspace_id: lead.workspace_id,
      pain_point: q.pain_point,
      urgency: q.urgency,
      budget_signal: q.budget_signal,
      decision_maker: q.decision_maker,
      objections: q.objections,
      interest_level: q.interest_level,
      intent: q.intent,
      summary: q.summary,
      last_qualified_at: new Date().toISOString(),
    } as any, { onConflict: "lead_id" });

    // Tag du dernier inbound avec l'intent détecté
    if (lastInbound) {
      await admin.from("whatsapp_messages").update({ intent: q.intent } as any).eq("id", lastInbound.id);
    }

    // Settings pour l'auto-stop
    let settings: any = null;
    if (lead.workspace_id) {
      const { data } = await admin.from("followup_automation_settings").select("*").eq("workspace_id", lead.workspace_id).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await admin.from("followup_automation_settings").select("*").eq("owner_id", lead.owner_id).is("workspace_id", null).maybeSingle();
      settings = data;
    }
    const autoStop = settings?.auto_stop_on_not_interested !== false;

    // Actions auto selon intent
    const actions: string[] = [];

    if ((q.intent === "not_interested" || q.intent === "wrong_person") && autoStop) {
      // Annuler toutes les tâches scheduled
      await admin.from("lead_followup_tasks")
        .update({ status: "cancelled", error_message: `Auto-stop: intent=${q.intent}` } as any)
        .eq("lead_id", lead_id)
        .in("status", ["pending", "scheduled"]);
      // Marquer le lead lost
      if (lead.status !== "lost" && lead.status !== "won") {
        await admin.from("leads").update({
          status: "lost",
          lost_reason: q.intent === "wrong_person" ? "Mauvaise personne (WhatsApp)" : "Désintéressé via WhatsApp",
        } as any).eq("id", lead_id);
      }
      actions.push("auto_stop_lost");
    } else if (q.intent === "ready_to_book") {
      // Anti-doublon : on ne crée une nouvelle tâche propose_meeting QUE si
      // (a) aucune n'est déjà en cours/programmée
      // (b) aucune n'a été exécutée dans les 10 dernières minutes (évite double envoi
      //     quand le webhook Meta fire plusieurs fois ou quand le lead enchaîne 2 réponses)
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existing } = await admin
        .from("lead_followup_tasks")
        .select("id, status, executed_at, created_at")
        .eq("lead_id", lead_id)
        .eq("task_type", "propose_meeting")
        .or(`status.in.(pending,scheduled,processing),and(status.eq.sent,executed_at.gte.${tenMinAgo}),and(created_at.gte.${tenMinAgo})`)
        .limit(1);
      if (!existing?.length) {
        await admin.from("lead_followup_tasks").insert({
          lead_id,
          owner_id: lead.owner_id,
          workspace_id: lead.workspace_id,
          task_type: "propose_meeting",
          status: "scheduled",
          scheduled_at: new Date().toISOString(),
          step_order: 80,
        } as any);
        actions.push("scheduled_booking_push");
      } else {
        actions.push("skipped_duplicate_propose_meeting");
      }
    } else if (q.intent === "confirms_slot") {
      // Le lead vient d'accepter un créneau précédemment proposé.
      // On crée une tâche de CONFIRMATION immédiate (séparée de propose_meeting),
      // qui doit envoyer un message de récap : créneau confirmé + invitation email + ressources à venir.
      // Anti-doublon léger : pas plus d'une confirmation envoyée dans les 5 dernières minutes.
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: existingConfirm } = await admin
        .from("lead_followup_tasks")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("task_type", "qualification")
        .eq("message_variant", "slot_confirmation")
        .or(`status.in.(pending,scheduled,processing),and(created_at.gte.${fiveMinAgo})`)
        .limit(1);
      if (!existingConfirm?.length) {
        await admin.from("lead_followup_tasks").insert({
          lead_id,
          owner_id: lead.owner_id,
          workspace_id: lead.workspace_id,
          task_type: "qualification",
          message_variant: "slot_confirmation",
          status: "scheduled",
          scheduled_at: new Date().toISOString(),
          step_order: 85,
        } as any);
        actions.push("scheduled_slot_confirmation");
      } else {
        actions.push("skipped_duplicate_confirmation");
      }
    }

    return new Response(JSON.stringify({ ok: true, qualification: q, actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("qualify-conversation error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
