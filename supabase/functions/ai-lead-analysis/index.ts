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

    const contentType = req.headers.get("content-type") || "";
    let type: string | null = null;
    let lead: any = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      type = String(formData.get("type") || "");

      if (type === "transcribe_audio") {
        const audioFile = formData.get("file");

        if (!(audioFile instanceof File)) {
          return new Response(JSON.stringify({ error: "Audio file is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Convert audio to base64 for Gemini multimodal transcription
        const audioBytes = await audioFile.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBytes)));
        const mimeType = audioFile.type || "audio/webm";

        const transcriptionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Transcris exactement ce qui est dit dans cet audio en français. Réponds UNIQUEMENT avec la transcription, sans rien ajouter." },
                  {
                    type: "input_audio",
                    input_audio: { data: base64Audio, format: mimeType.includes("wav") ? "wav" : "mp3" },
                  },
                ],
              },
            ],
          }),
        });

        if (!transcriptionResponse.ok) {
          const errorText = await transcriptionResponse.text();
          console.error("Transcription gateway error:", transcriptionResponse.status, errorText);

          return new Response(JSON.stringify({ error: "Transcription failed" }), {
            status: transcriptionResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const transcriptionData = await transcriptionResponse.json();
        const transcribedText = transcriptionData.choices?.[0]?.message?.content?.trim() ?? "";
        return new Response(JSON.stringify({ text: transcribedText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawLead = formData.get("lead");
      lead = rawLead ? JSON.parse(String(rawLead)) : null;
    } else {
      const body = await req.json();
      type = body?.type;
      lead = body?.lead;
    }

    // Shared field descriptions for AI prompts
    const LEAD_FIELDS_DESCRIPTION = `
Voici TOUS les champs disponibles pour un lead dans le CRM :
- name (string, obligatoire) : nom complet du contact
- email (string | null) : adresse email
- phone (string | null) : numéro de téléphone
- company_name (string | null) : nom de l'entreprise/société
- message (string | null) : message initial ou contexte
- source (enum) : "facebook", "website", "google_sheets", "organic_social", "recommendation", "google_my_business", "manual", "other"
- score (enum) : "hot" (chaud/intéressé), "warm" (tiède), "cold" (froid)
- status (enum) : "new", "contacted", "qualified", "proposal", "won", "lost", "ghost"
- show_status (enum) : "pending" (en attente de RDV), "show" (s'est présenté au RDV), "noshow" (ne s'est PAS présenté)
- lost_reason (string | null) : raison de perte si statut = lost (ex: "trop cher", "pas le bon timing", "a choisi un concurrent", "ne répond plus")
- next_action (string | null) : prochaine action à faire
- next_action_date (string ISO | null) : date de la prochaine action
- notes (string | null) : notes libres, tout ce qui ne rentre pas dans un champ spécifique
- ai_summary (string | null) : résumé court du lead
- sales_angle (string | null) : angle de vente recommandé
- last_contacted_at (string ISO | null) : date du dernier contact

RÈGLES IMPORTANTES :
- Extrais le MAXIMUM d'informations des données brutes vers les champs structurés
- "show" / "noshow" / "venu" / "pas venu" / "présent" / "absent" → show_status
- "perdu" / "lost" → status = "lost", et extrais la raison dans lost_reason
- "gagné" / "signé" / "won" → status = "won"
- "fantôme" / "ghost" / "ne répond plus" → status = "ghost"
- Tout ce qui ne correspond à AUCUN champ → mets-le dans notes
- Les numéros de téléphone → phone
- Les emails → email
- Les noms d'entreprise/société → company_name
- Les montants, devis, prix → notes (avec contexte)
- Les dates de RDV passés ou futurs → next_action_date si futur, notes si passé`;

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
      const nowIso = new Date().toISOString();
      systemPrompt = `Tu es un assistant CRM intelligent. L'utilisateur va te donner une note en langage naturel à propos d'un lead. Tu dois interpréter cette note et extraire les mises à jour CRM pour TOUS les champs concernés.

${LEAD_FIELDS_DESCRIPTION}

DATE/HEURE ACTUELLE : ${nowIso}

RÈGLES SPÉCIALES POUR LES TÂCHES / RAPPELS :
- Si l'utilisateur demande de créer une tâche, un rappel, une relance, un suivi, un appel, un RDV, un follow-up à une date/heure ("demain", "lundi", "dans 2h", "à 14h", "vendredi 10h", "la semaine prochaine"...) :
  → REMPLIS OBLIGATOIREMENT next_action (ce qu'il faut faire) ET next_action_date (date ISO 8601 calculée depuis MAINTENANT)
- "demain" = J+1 à 09:00 par défaut, "demain matin" = J+1 09:00, "demain aprem" = J+1 14:00
- "lundi/mardi/..." = prochain jour de semaine à 09:00 sauf heure précisée
- "dans X jours/heures" = calcule à partir de MAINTENANT
- "la semaine prochaine" = lundi prochain à 09:00
- Si aucune date n'est donnée mais qu'une action est demandée : mets next_action_date à demain 09:00 par défaut
- next_action_date DOIT TOUJOURS être au format ISO 8601 complet (ex: "2026-04-20T09:00:00.000Z")

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de backticks).`;

      userPrompt = `Lead actuel:
Nom: ${lead.name}
Entreprise: ${lead.company_name || 'Non renseigné'}
Statut actuel: ${lead.status}
Score actuel: ${lead.score}
Show status actuel: ${lead.show_status}
Notes actuelles: ${lead.notes || 'Aucune'}
Email: ${lead.email || 'Non renseigné'}
Téléphone: ${lead.phone || 'Non renseigné'}
Raison de perte: ${lead.lost_reason || 'Aucune'}

Note de l'utilisateur: "${lead.new_note}"

Interprète cette note et réponds avec ce JSON. N'inclus QUE les champs qui changent (garde null pour les autres) :
{
  "status": "new|contacted|qualified|proposal|won|lost|ghost" ou null si pas de changement,
  "score": "hot|warm|cold" ou null si pas de changement,
  "show_status": "pending|show|noshow" ou null si pas de changement,
  "lost_reason": "raison" ou null si pas de changement,
  "email": "email extrait" ou null si pas de changement,
  "phone": "téléphone extrait" ou null si pas de changement,
  "company_name": "entreprise extraite" ou null si pas de changement,
  "next_action": "prochaine action suggérée" ou null,
  "next_action_date": "date ISO si mentionnée" ou null,
  "last_contacted_at": "date ISO du dernier contact" ou null,
  "sales_angle": "angle de vente" ou null,
  "ai_summary": "résumé mis à jour" ou null,
  "notes_append": "tout ce qui ne correspond à aucun champ structuré, formaté proprement",
  "updates_summary": ["liste lisible des changements effectués en français"]
}`;
    } else if (type === "create_lead") {
      systemPrompt = `Tu es un assistant CRM intelligent. L'utilisateur veut ajouter un nouveau lead via des données brutes en langage naturel. Tu dois extraire TOUTES les informations et les mapper aux bons champs.

${LEAD_FIELDS_DESCRIPTION}

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de backticks).`;

      userPrompt = `L'utilisateur veut créer un lead avec ces données brutes : "${lead.new_note}"

Extrais le MAXIMUM d'informations structurées et réponds avec ce JSON exact :
{
  "name": "nom du lead (obligatoire, invente un placeholder si vraiment absent)",
  "email": "email ou null",
  "phone": "téléphone ou null",
  "company_name": "nom entreprise ou null",
  "message": "contexte/message initial ou null",
  "source": "facebook|website|google_sheets|manual|other",
  "score": "hot|warm|cold",
  "status": "new|contacted|qualified|proposal|won|lost|ghost",
  "show_status": "pending|show|noshow",
  "lost_reason": "raison si statut lost, sinon null",
  "next_action": "prochaine action suggérée ou null",
  "next_action_date": "date ISO si mentionnée ou null",
  "last_contacted_at": "date ISO du dernier contact si mentionnée ou null",
  "sales_angle": "angle de vente ou null",
  "notes": "TOUT ce qui ne rentre dans AUCUN champ ci-dessus. Prix, détails de projet, remarques, contexte additionnel. Ne perds aucune information.",
  "ai_summary": "résumé court du lead en 1-2 phrases"
}`;
    } else if (type === "booking_intent") {
      const nowIso = new Date().toISOString();
      systemPrompt = `Tu es un assistant CRM qui détecte les intentions de prise de rendez-vous en français.

L'utilisateur va décrire un RDV en langage naturel (vocal ou texte). Tu dois :
1. Détecter si c'est UNE INTENTION DE RDV (oui/non)
2. Extraire la date, l'heure, le nom du contact, son téléphone, son email si mentionnés
3. Détecter le sous-type :
   - "check" → l'utilisateur veut juste VOIR les créneaux dispos ("quels créneaux dispo demain ?", "qu'est-ce que j'ai libre vendredi ?")
   - "book" → l'utilisateur veut RÉSERVER un créneau ("RDV avec Jean demain 14h", "bloque-moi mardi 11h avec Marie")

DATE/HEURE ACTUELLE : ${nowIso} (timezone Europe/Paris)

RÈGLES DE DATE :
- "demain" = J+1, "après-demain" = J+2, "lundi/mardi/..." = prochain jour de semaine
- "dans X jours" = calcule à partir de MAINTENANT
- "la semaine prochaine" = lundi prochain
- Format date strict : "YYYY-MM-DD"
- Format heure strict : "HH:mm" (ex "14:00", "11:30"). Créneaux valides : 11:00 → 15:30 toutes les 15min.
- Si l'heure est imprécise ("matin" → "11:00", "midi" → "12:00", "aprem" → "14:00", "fin d'aprem" → "15:00")

Réponds UNIQUEMENT avec un JSON valide (pas de markdown).`;

      userPrompt = `Phrase de l'utilisateur : "${lead?.new_note || ''}"

Réponds avec ce JSON :
{
  "is_booking_intent": true ou false,
  "subtype": "check" ou "book" ou null,
  "date": "YYYY-MM-DD" ou null,
  "time_slot": "HH:mm" ou null,
  "contact_name": "nom du contact ou null",
  "contact_phone": "téléphone ou null",
  "contact_email": "email ou null",
  "notes": "contexte / raison du RDV ou null",
  "human_summary": "phrase courte pour confirmer à l'utilisateur (ex: 'RDV avec Jean Dupont demain 14h')"
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

    // For text-based responses, return raw text
    if (type === "pipeline_question") {
      return new Response(JSON.stringify({ answer: content.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type === "call_prep") {
      return new Response(JSON.stringify({ prep: content.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type === "warm_up") {
      return new Response(JSON.stringify({ plan: content.trim() }), {
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
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
