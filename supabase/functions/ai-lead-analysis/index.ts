import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    } else if (type === "create_lead") {
      systemPrompt = `Tu es un assistant CRM intelligent. L'utilisateur veut ajouter un nouveau lead via une note en langage naturel. Extrais les informations du lead.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de backticks).`;

      userPrompt = `L'utilisateur veut créer un lead avec cette description : "${lead.new_note}"

Extrais les informations et réponds avec ce JSON exact :
{
  "name": "nom du lead (obligatoire, invente un placeholder si absent)",
  "email": "email ou null",
  "phone": "téléphone ou null",
  "message": "contexte/message ou null",
  "source": "facebook" ou "website" ou "google_sheets" ou "manual" ou "other",
  "score": "hot" ou "warm" ou "cold",
  "status": "new",
  "next_action": "prochaine action suggérée ou null",
  "next_action_date": "date ISO si mentionnée ou null",
  "notes": "notes extraites de la description",
  "ai_summary": "résumé court du lead"
}`;
    } else if (type === "pipeline_question") {
      systemPrompt = `Tu es un assistant CRM expert. L'utilisateur te pose une question sur sa pipeline de vente. Tu as accès aux données résumées de sa pipeline.

Réponds de manière concise, utile et actionnable en français. Utilise des chiffres précis. Formate ta réponse en markdown lisible (listes, gras, etc.).`;

      userPrompt = `Données pipeline :
${lead?.pipeline_summary || ''}

Question de l'utilisateur : "${lead?.new_note || ''}"

Réponds de manière claire et concise.`;
    } else if (type === "call_prep") {
      systemPrompt = `Tu es un expert en vente. Génère une fiche pré-appel complète et actionnable en français pour un commercial. Structure en markdown avec :
1. **Résumé du lead** (2-3 lignes)
2. **Points clés à aborder**
3. **Objections anticipées** et comment y répondre
4. **Questions à poser**
5. **Proposition de closing**

Sois concis mais exhaustif.`;

      userPrompt = `Voici les infos du lead :
Nom: ${lead.name}
Entreprise: ${lead.company_name || 'Non renseigné'}
Score: ${lead.score}
Statut: ${lead.status}
Notes: ${lead.notes || 'Aucune'}
Résumé IA: ${lead.ai_summary || 'Aucun'}
Angle de vente: ${lead.sales_angle || 'Non défini'}
Prochaine action: ${lead.next_action || 'Non définie'}
Message initial: ${lead.message || 'Aucun'}

Génère la fiche pré-appel.`;
    } else if (type === "warm_up") {
      systemPrompt = `Tu es un expert en nurturing et réchauffement de leads froids. Génère un plan de réchauffement en 3 étapes concrètes et actionnables en français, structuré en markdown.

Pour chaque étape, donne :
- Le canal (WhatsApp, email, appel)
- Le timing (J+X)
- Le message/action exacte à faire
- L'objectif de cette étape

Adapte le contenu au profil du lead.`;

      userPrompt = `Voici les infos du lead froid à réchauffer :
Nom: ${lead.name}
Entreprise: ${lead.company_name || 'Non renseigné'}
Score actuel: ${lead.score}
Statut: ${lead.status}
Notes: ${lead.notes || 'Aucune'}
Résumé IA: ${lead.ai_summary || 'Aucun'}
Angle de vente: ${lead.sales_angle || 'Non défini'}
Message initial: ${lead.message || 'Aucun'}

Génère le plan de réchauffement en 3 étapes.`;
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

    // For pipeline questions, return raw text
    if (type === "pipeline_question") {
      return new Response(JSON.stringify({ answer: content.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
