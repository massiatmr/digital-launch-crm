import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FacebookFieldData {
  name: string;
  values: string[];
}

interface FacebookLeadData {
  field_data: FacebookFieldData[];
  created_time: string;
}

// Field name mapping: Facebook field names (lowercase) → extractor
const FIELD_MAP: Record<string, string> = {
  "full_name": "name",
  "full name": "name",
  "nom_complet": "name",
  "nom complet": "name",
  "name": "name",
  "email": "email",
  "e-mail": "email",
  "numéro_whatsapp": "phone",
  "numero_whatsapp": "phone",
  "phone_number": "phone",
  "phone": "phone",
  "téléphone": "phone",
  "telephone": "phone",
  "whatsapp": "phone",
  "company_name": "company_name",
  "company name": "company_name",
  "company": "company_name",
  "entreprise": "company_name",
  "nom_entreprise": "company_name",
};

function extractLeadFields(fieldData: FacebookFieldData[]) {
  const mapped: Record<string, string> = {};
  const extras: string[] = [];

  for (const field of fieldData) {
    const key = field.name.toLowerCase().trim();
    const value = field.values?.[0] ?? "";
    if (!value) continue;

    const target = FIELD_MAP[key];
    if (target && !mapped[target]) {
      mapped[target] = value;
    } else if (target && mapped[target]) {
      // Already mapped, store as extra
      extras.push(`${field.name}: ${value}`);
    } else {
      extras.push(`${field.name}: ${value}`);
    }
  }

  return { mapped, extras };
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\.\(\)]/g, "");
  // French 0X → +33X
  if (p.startsWith("0") && p.length === 10) {
    p = "+33" + p.slice(1);
  }
  if (!p.startsWith("+")) {
    p = "+" + p;
  }
  return p;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const FB_VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN");
  const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  const FB_LEAD_OWNER_ID = Deno.env.get("FB_LEAD_OWNER_ID");

  // ── GET: Facebook Webhook Verification ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
      console.log("✅ Facebook webhook verified");
      return new Response(challenge ?? "", { status: 200 });
    }
    console.error("❌ Webhook verification failed", { mode, token });
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Receive leadgen events ──
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response("OK", { status: 200 });
    }

    console.log("📩 Facebook webhook received:", JSON.stringify(body).slice(0, 500));

    // Respond immediately to Facebook
    const processPromise = processWebhook(body, FB_PAGE_ACCESS_TOKEN!, FB_LEAD_OWNER_ID!);
    
    // Use waitUntil pattern - process in background but don't block response
    processPromise.catch((err) => console.error("❌ Background processing error:", err));

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});

async function processWebhook(body: any, accessToken: string, ownerId: string) {
  if (body.object !== "page") {
    console.log("⚠️ Not a page event, skipping");
    return;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const leadgenId = change.value?.leadgen_id;
      const formId = change.value?.form_id;

      if (!leadgenId) {
        console.error("❌ No leadgen_id in change", change);
        continue;
      }

      console.log(`📋 Processing leadgen_id=${leadgenId}, form_id=${formId}`);

      // Fetch lead data from Facebook Graph API with retry
      let leadData: FacebookLeadData | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const fbRes = await fetch(
            `https://graph.facebook.com/v25.0/${leadgenId}?fields=field_data,created_time&access_token=${accessToken}`
          );
          if (!fbRes.ok) {
            const errText = await fbRes.text();
            console.error(`❌ Facebook API error (attempt ${attempt}):`, fbRes.status, errText);
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
              continue;
            }
            break;
          }
          leadData = await fbRes.json();
          break;
        } catch (err) {
          console.error(`❌ Fetch error (attempt ${attempt}):`, err);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }

      if (!leadData?.field_data) {
        console.error("❌ Could not fetch lead data after 3 attempts for", leadgenId);
        continue;
      }

      // Extract and map fields
      const { mapped, extras } = extractLeadFields(leadData.field_data);

      // Build notes with unmapped data
      let notesContent = `📘 Facebook Lead Ads\n- Form ID: ${formId ?? "N/A"}`;
      if (extras.length > 0) {
        notesContent += "\n- " + extras.join("\n- ");
      }
      notesContent += `\n- Leadgen ID: ${leadgenId}`;
      notesContent += `\n- Reçu le: ${leadData.created_time ?? new Date().toISOString()}`;

      const phone = mapped.phone ? normalizePhone(mapped.phone) : "";
      const email = mapped.email ?? "";
      const name = mapped.name ?? "Lead Facebook";

      // Check for existing lead by email or phone
      let existingLead = null;
      if (email) {
        const { data } = await supabase
          .from("leads")
          .select("id, notes")
          .eq("owner_id", ownerId)
          .eq("email", email)
          .maybeSingle();
        existingLead = data;
      }
      if (!existingLead && phone) {
        const { data } = await supabase
          .from("leads")
          .select("id, notes")
          .eq("owner_id", ownerId)
          .eq("phone", phone)
          .maybeSingle();
        existingLead = data;
      }

      if (existingLead) {
        // Update existing lead
        const existingNotes = existingLead.notes ?? "";
        const updatedNotes = existingNotes
          ? `${existingNotes}\n\n---\n${notesContent}`
          : notesContent;

        const { error } = await supabase
          .from("leads")
          .update({
            name: mapped.name || undefined,
            phone: phone || undefined,
            email: email || undefined,
            company_name: mapped.company_name || undefined,
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existingLead.id);

        if (error) {
          console.error("❌ Error updating lead:", error);
        } else {
          console.log(`✅ Updated existing lead ${existingLead.id}`);
        }
      } else {
        // Create new lead
        const { error } = await supabase.from("leads").insert({
          name,
          email,
          phone,
          company_name: mapped.company_name ?? "",
          notes: notesContent,
          source: "facebook" as any,
          status: "new" as any,
          score: "cold" as any,
          owner_id: ownerId,
          message: `Lead Facebook Ads – ${mapped.name ?? "Nouveau lead"}`,
        });

        if (error) {
          console.error("❌ Error creating lead:", error);
        } else {
          console.log(`✅ Created new lead: ${name} (${email || phone})`);
        }
      }
    }
  }
}
