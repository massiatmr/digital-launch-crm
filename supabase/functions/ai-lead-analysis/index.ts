import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, lead } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "analyze") {
      systemPrompt = `Tu es un expert en vente et qualification de leads. Tu dois analyser un lead et fournir:
1. Un score (hot, warm, cold)
2. Un résumé clair du lead
3. Un angle de vente recommandé
4. La prochaine action à effectuer
5. Un message WhatsApp personnalisé prêt à copier
6. Un script d'appel de vente avec objections possibles

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de backticks).`;

      userPrompt = `Analyse ce lead:
Nom: ${lead.name}
Email: ${lead.email || 'Non fourni'}
Téléphone: ${lead.phone || 'Non fourni'}
Message: ${lead.message || 'Aucun message'}
Source: ${lead.source}

Réponds avec ce JSON exact:
{
  "score": "hot" ou "warm" ou "cold",
  "ai_summary": "résumé du lead",
  "sales_angle": "angle de vente recommandé",
  "next_action": "prochaine action",
  "whatsapp_message": "message WhatsApp prêt à copier",
  "script": "script d'appel complet",
  "objections": [{"objection": "...", "response": "..."}]
}`;
    } else if (type === "natural_language_update") {
      systemPrompt = `Tu es un assistant CRM intelligent. L'utilisateur va te donner une note en langage naturel à propos d'un lead. Tu dois interpréter cette note et extraire les mises à jour CRM.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de backticks).`;

      userPrompt = `Lead actuel:
Nom: ${lead.name}
Statut actuel: ${lead.status}
Score actuel: ${lead.score}
Notes actuelles: ${lead.notes || 'Aucune'}

Note de l'utilisateur: "${lead.new_note}"

Interprète cette note et réponds avec ce JSON:
{
  "status": "new" ou "contacted" ou "qualified" ou "proposal" ou "won" ou "lost" (garde le statut actuel si pas de changement),
  "score": "hot" ou "warm" ou "cold" (garde le score actuel si pas de changement),
  "next_action": "prochaine action suggérée ou null",
  "next_action_date": "date ISO si mentionnée ou null",
  "notes_append": "note formatée à ajouter",
  "updates_summary": ["liste des changements effectués"]
}`;
    } else {
      throw new Error("Unknown type: " + type);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requêtes atteinte, réessayez dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits insuffisants. Ajoutez des crédits dans les paramètres." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error: " + response.status);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse AI response - strip markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleanContent);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-lead-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
