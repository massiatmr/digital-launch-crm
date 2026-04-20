import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OfferBrief {
  target: string;          // Cible (ex: déménageurs PME)
  problem: string;         // Douleur principale
  transformation: string;  // Résultat / promesse
  price: string;           // Prix souhaité (ex: 997€)
  brand_color?: string;    // Couleur de marque pour l'image
  niche?: string;
}

const SYSTEM_PROMPT = `Tu es un expert copywriter formé à la méthode Alex Hormozi (100M$ Offers).
Tu créés des offres irrésistibles en français : promesse claire, douleurs viscérales, valeur empilée massive, garanties fortes.
Style : direct, percutant, orienté résultat. Pas de blabla. Tu utilises le "tu".`;

serve(); // placeholder removed below
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const brief: OfferBrief = await req.json();
    if (!brief.target || !brief.problem || !brief.transformation) {
      return new Response(JSON.stringify({ error: "Brief incomplet" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `Brief de l'offre :
- Cible : ${brief.target}
- Problème principal : ${brief.problem}
- Transformation promise : ${brief.transformation}
- Prix final souhaité : ${brief.price}
- Niche : ${brief.niche || brief.target}

Génère une offre Hormozi complète et irrésistible.`;

    // === 1) Génération texte structuré via tool calling ===
    const textResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_irresistible_offer",
            description: "Génère une offre Hormozi structurée",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom commercial court (3-6 mots)" },
                headline: { type: "string", description: "Promesse principale, percutante (1 phrase)" },
                subheadline: { type: "string", description: "Sous-titre qui précise la promesse" },
                price_anchor: { type: "string", description: "Prix barré ancré (ex: 5000€)" },
                price_final: { type: "string", description: "Prix final affiché" },
                pain_points: {
                  type: "array",
                  description: "3 à 5 points de douleur viscéraux",
                  items: {
                    type: "object",
                    properties: {
                      icon: { type: "string", description: "Nom d'icône Lucide (ex: AlertTriangle, Clock, TrendingDown, Frown, Zap)" },
                      title: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["icon", "title", "description"],
                  },
                },
                transformation: {
                  type: "object",
                  properties: {
                    before: { type: "string", description: "Situation actuelle (douloureuse)" },
                    after: { type: "string", description: "Situation après (rêvée)" },
                  },
                  required: ["before", "after"],
                },
                deliverables: {
                  type: "array",
                  description: "4 à 6 livrables / bénéfices avec valeur perçue (stack de valeur)",
                  items: {
                    type: "object",
                    properties: {
                      icon: { type: "string", description: "Nom d'icône Lucide (ex: Rocket, Target, Gift, Shield, Star, Trophy)" },
                      title: { type: "string" },
                      description: { type: "string" },
                      value: { type: "string", description: "Valeur perçue en € (ex: 500€)" },
                    },
                    required: ["icon", "title", "description", "value"],
                  },
                },
                bonuses: {
                  type: "array",
                  description: "2 à 3 bonus exclusifs",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      value: { type: "string" },
                    },
                    required: ["title", "description", "value"],
                  },
                },
                guarantee: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Garantie forte (ex: Résultats ou remboursé 30 jours)" },
                    description: { type: "string" },
                  },
                  required: ["title", "description"],
                },
                faq: {
                  type: "array",
                  description: "4 questions/réponses qui lèvent les objections",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                    },
                    required: ["question", "answer"],
                  },
                },
                cta_text: { type: "string", description: "Texte du bouton CTA principal" },
                image_prompt: {
                  type: "string",
                  description: "Prompt visuel anglais pour générer l'image hero (style moderne, professionnel, abstrait, pas de texte). Doit refléter la transformation promise.",
                },
              },
              required: ["name", "headline", "subheadline", "price_anchor", "price_final", "pain_points", "transformation", "deliverables", "bonuses", "guarantee", "faq", "cta_text", "image_prompt"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_irresistible_offer" } },
      }),
    });

    if (!textResp.ok) {
      const t = await textResp.text();
      console.error("AI text error:", textResp.status, t);
      if (textResp.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes IA. Réessaye dans 1 min." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (textResp.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés. Recharge ton workspace Lovable." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const textData = await textResp.json();
    const toolCall = textData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Pas de réponse structurée de l'IA");
    const offer = JSON.parse(toolCall.function.arguments);

    // === 2) Génération image hero ===
    let coverImageUrl: string | null = null;
    try {
      const brandHint = brief.brand_color ? ` Use color palette accent ${brief.brand_color}.` : " Use vibrant purple/violet (#7C3AED) accents.";
      const imagePrompt = `${offer.image_prompt}. Modern minimal premium hero image, cinematic lighting, professional, abstract concept art, no text, no logo, dark background.${brandHint}`;

      const imgResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imgResp.ok) {
        const imgData = await imgResp.json();
        const b64Url: string | undefined = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (b64Url?.startsWith("data:image/")) {
          const [meta, b64] = b64Url.split(",");
          const mime = meta.split(":")[1].split(";")[0];
          const ext = mime.split("/")[1] || "png";
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const path = `${user.id}/${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("offer-assets")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (!upErr) {
            const { data: pub } = supabase.storage.from("offer-assets").getPublicUrl(path);
            coverImageUrl = pub.publicUrl;
          } else {
            console.error("Upload error:", upErr);
          }
        }
      } else {
        console.error("Image gen failed:", imgResp.status, await imgResp.text());
      }
    } catch (e) {
      console.error("Image generation skipped:", e);
    }

    return new Response(JSON.stringify({ offer, cover_image_url: coverImageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-offer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
