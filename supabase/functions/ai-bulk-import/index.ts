import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_SOURCES = [
  "facebook", "website", "google_sheets", "manual", "other",
  "organic_social", "recommendation", "google_my_business",
];
const VALID_SCORES = ["hot", "warm", "cold"];
const VALID_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost", "ghost"];

const MAX_ROWS = 500;

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let cleaned = String(raw).replace(/[\s\-.()\u00A0]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "+33" + cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  return cleaned;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const {
      rows: inputRows,
      rawText,
      fileBase64,
      fileName,
      mimeType,
      workspace_id,
    }: {
      rows?: any[];
      rawText?: string;
      fileBase64?: string;
      fileName?: string;
      mimeType?: string;
      workspace_id?: string;
    } = body || {};

    let rawRows: any[] = Array.isArray(inputRows) ? inputRows.slice(0, MAX_ROWS) : [];

    // ---- 1. Extract from PDF / image / raw text via Gemini ----
    if (rawRows.length === 0 && (rawText || fileBase64)) {
      const userContent: any[] = [
        {
          type: "text",
          text:
            "Tu es un agent d'extraction CRM. Analyse le contenu fourni et extrais TOUS les leads/contacts présents (un objet par contact). " +
            "Réponds en utilisant l'outil extract_rows. Maximum 500 lignes. " +
            "Si tu identifies une source probable (Facebook Ads, formulaire web, Google Sheets, recommandation), précise-la.",
        },
      ];
      if (rawText) userContent.push({ type: "text", text: `Texte source:\n${rawText.slice(0, 50000)}` });
      if (fileBase64 && mimeType) {
        if (mimeType.startsWith("image/")) {
          userContent.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${fileBase64}` },
          });
        } else {
          // PDF and others: send as file
          userContent.push({
            type: "file",
            file: { filename: fileName || "document", file_data: `data:${mimeType};base64,${fileBase64}` },
          });
        }
      }

      const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: userContent }],
          tools: [{
            type: "function",
            function: {
              name: "extract_rows",
              description: "Return raw rows extracted from a document",
              parameters: {
                type: "object",
                properties: {
                  rows: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
                required: ["rows"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_rows" } },
        }),
      });

      if (extractRes.status === 429 || extractRes.status === 402) {
        return new Response(JSON.stringify({
          error: extractRes.status === 429 ? "Trop de requêtes IA, réessaie dans un instant." : "Crédits IA épuisés.",
        }), { status: extractRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const extractJson = await extractRes.json();
      const toolCall = extractJson?.choices?.[0]?.message?.tool_calls?.[0];
      try {
        const args = JSON.parse(toolCall?.function?.arguments || "{}");
        rawRows = Array.isArray(args.rows) ? args.rows.slice(0, MAX_ROWS) : [];
      } catch {
        rawRows = [];
      }
    }

    if (rawRows.length === 0) {
      return new Response(JSON.stringify({
        error: "Aucune ligne détectée dans le document.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- 2. Try heuristic column mapping first (fast path, no AI) ----
    const FIELD_PATTERNS: Record<string, RegExp[]> = {
      name: [/^(name|full.?name|nom.?complet|nom|contact|client|prospect)$/i],
      first_name: [/^(first.?name|pr[eé]nom|firstname)$/i],
      last_name: [/^(last.?name|nom.?de.?famille|lastname|surname)$/i],
      email: [/^(e?.?mail|courriel|adresse.?mail)$/i],
      phone: [/^(phone|t[eé]l|telephone|portable|mobile|num[eé]ro|gsm|tel.?portable)$/i],
      company_name: [/^(company|entreprise|soci[eé]t[eé]|org|organisation|business)$/i],
      message: [/^(message|commentaire|comment|notes?|remarque|demande)$/i],
      source: [/^(source|origine|canal|provenance)$/i],
      status: [/^(status|statut|etat|[eé]tat)$/i],
      score: [/^(score|priorit[eé]|priority|rating)$/i],
    };

    const firstRow = rawRows[0] || {};
    const rawKeys = Object.keys(firstRow);
    const keyMap: Record<string, string> = {}; // originalKey -> targetField
    for (const key of rawKeys) {
      const k = String(key).trim();
      for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
        if (patterns.some((p) => p.test(k))) {
          if (!Object.values(keyMap).includes(field)) keyMap[key] = field;
          break;
        }
      }
    }

    const matchedFields = new Set(Object.values(keyMap));
    const hasNameSignal = matchedFields.has("name") || (matchedFields.has("first_name") && matchedFields.has("last_name")) || matchedFields.has("first_name");
    const hasContact = matchedFields.has("email") || matchedFields.has("phone");
    const heuristicOk = hasNameSignal && hasContact;

    let mapped: any[] = [];

    if (heuristicOk) {
      // Fast path: apply mapping directly without AI
      mapped = rawRows.map((r) => {
        const out: any = { name: "", email: "", phone: "", company_name: "", message: "", source: "manual", score: "cold", status: "new", notes: "" };
        const extras: string[] = [];
        const firstName = Object.entries(keyMap).find(([, f]) => f === "first_name")?.[0];
        const lastName = Object.entries(keyMap).find(([, f]) => f === "last_name")?.[0];
        for (const [orig, field] of Object.entries(keyMap)) {
          const val = safeStr(r[orig]);
          if (!val) continue;
          if (field === "first_name" || field === "last_name") continue; // handled below
          out[field] = val;
        }
        if (!out.name) {
          const fn = firstName ? safeStr(r[firstName]) : "";
          const ln = lastName ? safeStr(r[lastName]) : "";
          out.name = [fn, ln].filter(Boolean).join(" ").trim();
        }
        for (const [k, v] of Object.entries(r)) {
          if (keyMap[k]) continue;
          const val = safeStr(v);
          if (val) extras.push(`${k}: ${val}`);
        }
        out.notes = extras.join(" | ");
        return out;
      });
    } else {
      // AI path: only send a tiny sample to INFER the mapping, then apply locally
      const sample = rawRows.slice(0, 5);
      const mapRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "Tu reçois un échantillon de lignes brutes. Retourne UNIQUEMENT un mapping des clés vers les champs standards du schéma leads. " +
                "Champs cibles: name, email, phone, company_name, message, source, score, status. " +
                "Toute clé non mappée sera mise dans 'notes'. Réponds via l'outil propose_mapping.",
            },
            { role: "user", content: `Échantillon (${sample.length} lignes):\n${JSON.stringify(sample)}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "propose_mapping",
              description: "Return column mapping",
              parameters: {
                type: "object",
                properties: {
                  mapping: {
                    type: "object",
                    description: "Object where each key is a source column name and value is the target field",
                    additionalProperties: { type: "string" },
                  },
                },
                required: ["mapping"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "propose_mapping" } },
        }),
      });

      if (mapRes.status === 429 || mapRes.status === 402) {
        return new Response(JSON.stringify({
          error: mapRes.status === 429 ? "Trop de requêtes IA, réessaie dans un instant." : "Crédits IA épuisés.",
        }), { status: mapRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const mapJson = await mapRes.json();
      const mapToolCall = mapJson?.choices?.[0]?.message?.tool_calls?.[0];
      let aiMapping: Record<string, string> = {};
      try {
        const args = JSON.parse(mapToolCall?.function?.arguments || "{}");
        aiMapping = args.mapping || {};
      } catch { aiMapping = {}; }

      const VALID_TARGETS = new Set(["name", "email", "phone", "company_name", "message", "source", "score", "status"]);
      mapped = rawRows.map((r) => {
        const out: any = { name: "", email: "", phone: "", company_name: "", message: "", source: "manual", score: "cold", status: "new", notes: "" };
        const extras: string[] = [];
        for (const [k, v] of Object.entries(r)) {
          const val = safeStr(v);
          const target = aiMapping[k];
          if (target && VALID_TARGETS.has(target) && val) {
            out[target] = val;
          } else if (val) {
            extras.push(`${k}: ${val}`);
          }
        }
        out.notes = extras.join(" | ");
        return out;
      });
    }

    if (mapped.length === 0) {
      return new Response(JSON.stringify({ error: "Impossible de mapper les colonnes." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- 3. Validate + normalize ----
    const normalized = mapped.map((m, idx) => {
      const errors: string[] = [];
      const name = safeStr(m.name);
      const email = safeStr(m.email).toLowerCase();
      const phone = normalizePhone(m.phone);
      const source = VALID_SOURCES.includes(m.source) ? m.source : "manual";
      const score = VALID_SCORES.includes(m.score) ? m.score : "cold";
      const status = VALID_STATUSES.includes(m.status) ? m.status : "new";

      if (!name) errors.push("name_missing");
      if (email && !isValidEmail(email)) errors.push("email_invalid");
      if (!email && !phone) errors.push("no_contact");

      return {
        index: idx,
        name,
        email,
        phone,
        company_name: safeStr(m.company_name),
        message: safeStr(m.message),
        notes: safeStr(m.notes),
        source,
        score,
        status,
        errors,
        duplicate_of: null as string | null,
        duplicate_field: null as string | null,
      };
    });

    // ---- 4. Duplicate detection against existing leads ----
    let q: any = supabase.from("leads").select("id, name, email, phone").is("deleted_at", null);
    if (workspace_id) q = q.eq("workspace_id", workspace_id);
    const { data: existing } = await q;
    const existingArr: any[] = existing || [];
    const emailMap = new Map<string, any>();
    const phoneMap = new Map<string, any>();
    for (const ex of existingArr) {
      if (ex.email) emailMap.set(String(ex.email).toLowerCase(), ex);
      if (ex.phone) phoneMap.set(normalizePhone(ex.phone), ex);
    }

    let duplicates = 0;
    let errors = 0;
    for (const r of normalized) {
      if (r.email && emailMap.has(r.email)) {
        r.duplicate_of = emailMap.get(r.email).id;
        r.duplicate_field = "email";
        duplicates++;
      } else if (r.phone && phoneMap.has(r.phone)) {
        r.duplicate_of = phoneMap.get(r.phone).id;
        r.duplicate_field = "phone";
        duplicates++;
      }
      if (r.errors.length > 0) errors++;
    }

    return new Response(JSON.stringify({
      rows: normalized,
      stats: {
        total: normalized.length,
        valid: normalized.length - errors,
        duplicates,
        errors,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-bulk-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
