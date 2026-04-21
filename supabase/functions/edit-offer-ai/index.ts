import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un expert copywriter (méthode Hormozi) spécialisé dans l'édition de landing pages.

Tu reçois :
1. L'état actuel de l'offre (JSON : nom, description, niche, page avec headline/subheadline/cta_text/sections/testimonials)
2. Une instruction de l'utilisateur ("rends le titre plus accrocheur", "ajoute une section témoignages", "supprime la FAQ", "change le ton pour plus direct", etc.)

Tu dois renvoyer la VERSION COMPLÈTE MISE À JOUR de l'offre via l'outil "update_offer".

Règles strictes :
- Ne mets JAMAIS le prix en avant. Le prix se discute en rendez-vous (plusieurs formules possibles).
- Préfère un CTA "Réserver un appel" plutôt qu'un prix affiché.
- Style : direct, percutant, en français, tutoiement. Moins de blabla, plus d'impact.
- Privilégie les visuels via icônes Lucide (chaque pain/deliverable/bonus DOIT avoir un icon valide).
- Sections supportées : pain_points, transformation, deliverables, bonuses, solution, guarantee, faq, portfolio.
- Si l'utilisateur demande de supprimer une section, retire-la complètement du tableau sections.
- Si l'utilisateur demande d'ajouter une section, crée-la avec une structure cohérente.
- Conserve les valeurs existantes que l'utilisateur n'a pas demandé à modifier.
- Réponds en 1 phrase courte et claire dans "summary" (ce que tu as fait).

Icônes valides (Lucide) : AlertTriangle, AlertCircle, Clock, TrendingDown, Frown, Zap, Rocket, Target, Gift, Shield, Star, Trophy, Gem, Sparkles, Check.`;

const updateOfferTool = {
  type: "function",
  function: {
    name: "update_offer",
    description: "Mets à jour l'offre complète",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Résumé court (1 phrase) de la modification" },
        offer: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            niche: { type: "string" },
          },
          required: ["name", "description"],
        },
        page: {
          type: "object",
          properties: {
            headline: { type: "string" },
            subheadline: { type: "string" },
            cta_text: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  variant: { type: "string" },
                  items: { type: "array", items: { type: "object", additionalProperties: true } },
                  before: { type: "string" },
                  after: { type: "string" },
                  questions: { type: "array", items: { type: "object", additionalProperties: true } },
                },
                required: ["type", "title"],
                additionalProperties: true,
              },
            },
            testimonials: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  company: { type: "string" },
                  text: { type: "string" },
                  rating: { type: "number" },
                },
                required: ["name", "text"],
              },
            },
          },
          required: ["headline", "subheadline", "cta_text", "sections", "testimonials"],
        },
      },
      required: ["summary", "offer", "page"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { instruction, offer, page, history } = await req.json();
    if (!instruction || !offer || !page) {
      return new Response(JSON.stringify({ error: "Missing instruction/offer/page" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `État actuel de l'offre :\n\`\`\`json\n${JSON.stringify({
          offer: { name: offer.name, description: offer.description, niche: offer.niche },
          page: {
            headline: page.headline,
            subheadline: page.subheadline,
            cta_text: page.cta_text,
            sections: page.sections || [],
            testimonials: page.testimonials || [],
          },
        }, null, 2)}\n\`\`\``,
      },
    ];

    if (Array.isArray(history)) {
      for (const m of history.slice(-6)) {
        if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: String(m.content).slice(0, 2000) });
        }
      }
    }

    messages.push({ role: "user", content: `Instruction : ${instruction}` });

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [updateOfferTool],
        tool_choice: { type: "function", function: { name: "update_offer" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes IA. Réessaye dans 1 min." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Pas de réponse structurée de l'IA");
    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edit-offer-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
