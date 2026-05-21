// AI Assistant Chat — unified intent classifier + proposer
// Returns ONE of: question / update_lead / create_lead / booking / reminder
// NEVER writes to DB — backend only proposes, the frontend confirms & applies.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Tu es l'assistant IA d'un CRM de vente. Tu réponds en français, avec un ton chaleureux et concis (style ChatGPT).

Pour CHAQUE message utilisateur, tu dois choisir UN SEUL outil parmi :
- answer_question : pour toute question, analyse, résumé, conseil ou conversation libre. Pas d'écriture en base.
- propose_update_lead : si l'utilisateur veut modifier un lead existant (statut, score, note, prochaine action…). Tu DOIS référencer un lead par son id depuis le contexte.
- propose_create_lead : si l'utilisateur veut créer un NOUVEAU lead/prospect/contact.
- propose_booking : si l'utilisateur veut prendre/vérifier un rendez-vous (RDV, créneau, meeting, appel programmé).
- propose_reminder : si l'utilisateur veut créer un rappel ou une tâche pour le suivi d'un lead.

RÈGLES STRICTES :
1. Tu ne fais JAMAIS d'action sans passer par un outil "propose_*". Aucune écriture directe.
2. Pour update_lead/reminder, identifie le lead via le contexte fourni (leads_index). Si tu n'es pas sûr, utilise answer_question pour demander une précision.
3. assistant_reply doit être un message court et naturel qui annonce ce que tu proposes (ex: "Ok, je prépare la mise à jour de Marc Dupont…").
4. Pour answer_question, donne une vraie réponse complète et utile (markdown autorisé).
5. Réponds dans la même langue que l'utilisateur (français par défaut).`;

const tools = [
  {
    type: "function",
    function: {
      name: "answer_question",
      description: "Répondre à une question / discussion sans modifier la base.",
      parameters: {
        type: "object",
        properties: {
          assistant_reply: { type: "string", description: "Réponse complète à afficher dans le chat (markdown ok)." },
        },
        required: ["assistant_reply"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_lead",
      description: "Proposer la mise à jour d'un lead existant (à confirmer côté UI).",
      parameters: {
        type: "object",
        properties: {
          assistant_reply: { type: "string" },
          lead_id: { type: "string", description: "ID du lead depuis leads_index." },
          lead_name: { type: "string" },
          changes: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["new", "contacted", "qualified", "proposal", "won", "lost", "ghost"] },
              score: { type: "string", enum: ["hot", "warm", "cold"] },
              show_status: { type: "string", enum: ["pending", "show", "noshow"] },
              email: { type: "string" },
              phone: { type: "string" },
              company_name: { type: "string" },
              sales_angle: { type: "string" },
              next_action: { type: "string" },
              next_action_date: { type: "string", description: "ISO date" },
              notes_append: { type: "string", description: "Note à AJOUTER aux notes existantes." },
              lost_reason: { type: "string" },
            },
            additionalProperties: false,
          },
          summary: { type: "array", items: { type: "string" }, description: "Résumé lisible de chaque changement." },
        },
        required: ["assistant_reply", "lead_id", "lead_name", "changes", "summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_lead",
      description: "Proposer la création d'un nouveau lead (à confirmer côté UI).",
      parameters: {
        type: "object",
        properties: {
          assistant_reply: { type: "string" },
          fields: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              company_name: { type: "string" },
              source: { type: "string", enum: ["facebook", "website", "google_sheets", "manual", "other", "organic_social", "recommendation", "google_my_business"] },
              score: { type: "string", enum: ["hot", "warm", "cold"] },
              status: { type: "string", enum: ["new", "contacted", "qualified", "proposal", "won", "lost", "ghost"] },
              message: { type: "string" },
              notes: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
        required: ["assistant_reply", "fields"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_booking",
      description: "Proposer un rendez-vous (vérification de dispo + confirmation côté UI).",
      parameters: {
        type: "object",
        properties: {
          assistant_reply: { type: "string" },
          date: { type: "string", description: "Date ISO YYYY-MM-DD" },
          time_slot: { type: "string", description: "HH:MM optionnel" },
          lead_id: { type: "string" },
          contact_name: { type: "string" },
          contact_email: { type: "string" },
          contact_phone: { type: "string" },
          notes: { type: "string" },
        },
        required: ["assistant_reply", "date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_reminder",
      description: "Proposer un rappel/tâche à confirmer.",
      parameters: {
        type: "object",
        properties: {
          assistant_reply: { type: "string" },
          lead_id: { type: "string" },
          lead_name: { type: "string" },
          action: { type: "string", description: "Description du rappel." },
          due_date: { type: "string", description: "ISO datetime." },
        },
        required: ["assistant_reply", "lead_id", "action", "due_date"],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const body = await req.json();
    const messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages.slice(-10) : [];
    const ctx = body?.context || {};

    const today = new Date().toISOString().slice(0, 10);
    const contextPreamble = `Contexte CRM (date du jour: ${today}).
Tu as accès à toutes les infos ci-dessous pour répondre, analyser, agréger, classer et résumer SANS demander à l'utilisateur de te les fournir.
Si une donnée demandée est présente dans le contexte (ex: raisons des leads perdus, sources, scores, présence RDV, dernier contact), réponds directement avec les chiffres/listes. Ne dis JAMAIS "je n'ai pas accès" si l'info figure dans le contexte.

${ctx.pipeline_summary ? "=== Pipeline ===\n" + ctx.pipeline_summary : ""}
${ctx.leads_index ? "\n=== Leads (id | nom | champs clés) ===\n" + ctx.leads_index : ""}`;

    const aiPayload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: contextPreamble },
        ...messages,
      ],
      tools,
      tool_choice: "required",
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(aiPayload),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Trop de requêtes IA, réessaie dans un instant." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const choice = data?.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0];

    if (!toolCall?.function) {
      // Fallback : pas de tool, on renvoie le contenu textuel
      return new Response(JSON.stringify({
        intent: "question",
        assistant_reply: choice?.content || "Désolé, je n'ai pas compris.",
        payload: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fnName = toolCall.function.name as string;
    let args: any = {};
    try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch { args = {}; }

    const intentMap: Record<string, string> = {
      answer_question: "question",
      propose_update_lead: "update_lead",
      propose_create_lead: "create_lead",
      propose_booking: "booking",
      propose_reminder: "reminder",
    };

    const intent = intentMap[fnName] || "question";
    const assistant_reply = args.assistant_reply || "";
    delete args.assistant_reply;

    return new Response(JSON.stringify({
      intent,
      assistant_reply,
      payload: Object.keys(args).length ? args : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-assistant-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
