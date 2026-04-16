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

type LeadLookupResult = {
  id: string;
  notes: string | null;
};

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

function logInfo(requestId: string, message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.log(`[facebook-webhook][${requestId}] ${message}`, meta);
    return;
  }

  console.log(`[facebook-webhook][${requestId}] ${message}`);
}

function logError(requestId: string, message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.error(`[facebook-webhook][${requestId}] ${message}`, meta);
    return;
  }

  console.error(`[facebook-webhook][${requestId}] ${message}`);
}

Deno.serve(async (req) => {
  // ─── ABSOLUTE FIRST LOG — proof Meta hit the endpoint ───
  console.log("WEBHOOK RECEIVED");
  const rawHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { rawHeaders[k] = v; });
  console.log("WEBHOOK HEADERS:", JSON.stringify(rawHeaders));

  let rawBody = "";
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    try {
      rawBody = await req.clone().text();
      console.log("WEBHOOK RAW BODY:", rawBody);
    } catch (e) {
      console.log("WEBHOOK RAW BODY READ ERROR:", String(e));
    }
  } else {
    console.log("WEBHOOK URL:", req.url);
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const FB_VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN");
  const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  const FB_LEAD_OWNER_ID = Deno.env.get("FB_LEAD_OWNER_ID");

  logInfo(requestId, "Incoming webhook request", {
    method: req.method,
    hasVerifyToken: Boolean(FB_VERIFY_TOKEN),
    hasPageAccessToken: Boolean(FB_PAGE_ACCESS_TOKEN),
    hasLeadOwnerId: Boolean(FB_LEAD_OWNER_ID),
  });

  // ── GET: Facebook Webhook Verification ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    logInfo(requestId, "Verification challenge received", {
      mode,
      tokenMatches: token === FB_VERIFY_TOKEN,
      hasChallenge: Boolean(challenge),
    });

    if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
      logInfo(requestId, "Facebook webhook verified successfully");
      return new Response(challenge ?? "", { status: 200 });
    }
    logError(requestId, "Webhook verification failed", {
      mode,
      tokenMatches: token === FB_VERIFY_TOKEN,
    });
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Receive leadgen events ──
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      logError(requestId, "POST payload is not valid JSON");
      return new Response("OK", { status: 200 });
    }

    logInfo(requestId, "Facebook webhook payload received", {
      object: body?.object,
      entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
      payloadPreview: JSON.stringify(body).slice(0, 500),
    });

    if (!FB_PAGE_ACCESS_TOKEN || !FB_LEAD_OWNER_ID) {
      logError(requestId, "Missing required Facebook webhook secrets", {
        hasPageAccessToken: Boolean(FB_PAGE_ACCESS_TOKEN),
        hasLeadOwnerId: Boolean(FB_LEAD_OWNER_ID),
      });

      return new Response("OK", { status: 200 });
    }

    // Respond immediately to Facebook
    const processPromise = processWebhook(body, FB_PAGE_ACCESS_TOKEN, FB_LEAD_OWNER_ID, requestId);
    
    // Use waitUntil pattern - process in background but don't block response
    processPromise.catch((err) =>
      logError(requestId, "Background processing error", {
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});

async function processWebhook(body: any, accessToken: string, ownerId: string, requestId: string) {
  const startedAt = Date.now();

  try {
    if (body.object !== "page") {
      logInfo(requestId, "Skipping non-page event", { object: body?.object });
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      logError(requestId, "Missing backend credentials for database access", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    logInfo(requestId, "Webhook processing started", {
      ownerId,
      entryCount: Array.isArray(body.entry) ? body.entry.length : 0,
    });

    for (const [entryIndex, entry] of (body.entry ?? []).entries()) {
      logInfo(requestId, "Processing entry", {
        entryIndex,
        changeCount: Array.isArray(entry?.changes) ? entry.changes.length : 0,
      });

      for (const [changeIndex, change] of (entry.changes ?? []).entries()) {
        if (change.field !== "leadgen") {
          logInfo(requestId, "Skipping non-leadgen change", {
            entryIndex,
            changeIndex,
            field: change?.field,
          });
          continue;
        }

        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;

        if (!leadgenId) {
          logError(requestId, "Missing leadgen_id in change payload", {
            entryIndex,
            changeIndex,
            change,
          });
          continue;
        }

        logInfo(requestId, "Leadgen event received", {
          entryIndex,
          changeIndex,
          leadgenId,
          formId,
        });

        let leadData: FacebookLeadData | null = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            logInfo(requestId, "Fetching lead details from Facebook Graph API", {
              leadgenId,
              attempt,
            });

            const fbRes = await fetch(
              `https://graph.facebook.com/v25.0/${leadgenId}?fields=field_data,created_time&access_token=${accessToken}`
            );

            if (!fbRes.ok) {
              const errText = await fbRes.text();
              logError(requestId, "Facebook Graph API returned an error", {
                leadgenId,
                attempt,
                status: fbRes.status,
                response: errText.slice(0, 1000),
              });

              if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 2000 * attempt));
                continue;
              }

              break;
            }

            leadData = await fbRes.json();

            logInfo(requestId, "Facebook lead data fetched successfully", {
              leadgenId,
              fieldCount: Array.isArray(leadData?.field_data) ? leadData.field_data.length : 0,
              fieldNames: (leadData?.field_data ?? []).map((field) => field.name),
              createdTime: leadData?.created_time,
            });

            break;
          } catch (err) {
            logError(requestId, "Facebook Graph API fetch threw an exception", {
              leadgenId,
              attempt,
              error: err instanceof Error ? err.message : String(err),
            });

            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        }

        if (!leadData?.field_data) {
          logError(requestId, "Failed to retrieve lead details after retries", { leadgenId });
          continue;
        }

        const { mapped, extras } = extractLeadFields(leadData.field_data);
        const phone = mapped.phone ? normalizePhone(mapped.phone) : "";
        const email = mapped.email ?? "";
        const name = mapped.name ?? "Lead Facebook";

        logInfo(requestId, "Lead data mapped to CRM fields", {
          leadgenId,
          mappedKeys: Object.keys(mapped),
          hasName: Boolean(mapped.name),
          hasEmail: Boolean(email),
          hasPhone: Boolean(phone),
          hasCompanyName: Boolean(mapped.company_name),
          extrasCount: extras.length,
        });

        let notesContent = `📘 Facebook Lead Ads\n- Form ID: ${formId ?? "N/A"}`;
        if (extras.length > 0) {
          notesContent += "\n- " + extras.join("\n- ");
        }
        notesContent += `\n- Leadgen ID: ${leadgenId}`;
        notesContent += `\n- Reçu le: ${leadData.created_time ?? new Date().toISOString()}`;

        let existingLead: LeadLookupResult | null = null;

        if (email) {
          const { data, error } = await supabase
            .from("leads")
            .select("id, notes")
            .eq("owner_id", ownerId)
            .eq("email", email)
            .maybeSingle();

          if (error) {
            logError(requestId, "Lead lookup by email failed", {
              leadgenId,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          } else {
            existingLead = data;
            logInfo(requestId, "Lead lookup by email completed", {
              leadgenId,
              found: Boolean(data),
            });
          }
        }

        if (!existingLead && phone) {
          const { data, error } = await supabase
            .from("leads")
            .select("id, notes")
            .eq("owner_id", ownerId)
            .eq("phone", phone)
            .maybeSingle();

          if (error) {
            logError(requestId, "Lead lookup by phone failed", {
              leadgenId,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          } else {
            existingLead = data;
            logInfo(requestId, "Lead lookup by phone completed", {
              leadgenId,
              found: Boolean(data),
            });
          }
        }

        if (!email && !phone) {
          logInfo(requestId, "No email or phone available for deduplication", {
            leadgenId,
          });
        }

        if (existingLead) {
          const existingNotes = existingLead.notes ?? "";
          const updatedNotes = existingNotes
            ? `${existingNotes}\n\n---\n${notesContent}`
            : notesContent;

          const updatePayload = {
            name: mapped.name || undefined,
            phone: phone || undefined,
            email: email || undefined,
            company_name: mapped.company_name || undefined,
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          };

          logInfo(requestId, "Updating existing lead", {
            leadgenId,
            leadId: existingLead.id,
            updateFields: Object.keys(updatePayload).filter(
              (key) => updatePayload[key as keyof typeof updatePayload] !== undefined,
            ),
          });

          const { error } = await supabase
            .from("leads")
            .update(updatePayload as any)
            .eq("id", existingLead.id);

          if (error) {
            logError(requestId, "Lead update failed", {
              leadgenId,
              leadId: existingLead.id,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          } else {
            logInfo(requestId, "Existing lead updated successfully", {
              leadgenId,
              leadId: existingLead.id,
            });
          }
        } else {
          const insertPayload = {
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
          };

          logInfo(requestId, "Creating new lead in CRM", {
            leadgenId,
            ownerId,
            hasEmail: Boolean(email),
            hasPhone: Boolean(phone),
            status: insertPayload.status,
            source: insertPayload.source,
          });

          const { data, error } = await supabase
            .from("leads")
            .insert(insertPayload)
            .select("id")
            .maybeSingle();

          if (error) {
            logError(requestId, "Lead creation failed", {
              leadgenId,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          } else {
            logInfo(requestId, "New lead created successfully", {
              leadgenId,
              leadId: data?.id ?? null,
            });

            // Fire-and-forget push + email notification
            if (data?.id) {
              try {
                const notifyRes = await supabase.functions.invoke("notify-new-lead", {
                  body: { lead_id: data.id },
                });
                logInfo(requestId, "notify-new-lead invoked", {
                  leadId: data.id,
                  result: notifyRes.data,
                  error: notifyRes.error?.message,
                });
              } catch (notifyErr) {
                logError(requestId, "notify-new-lead invocation failed", {
                  leadId: data.id,
                  error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logError(requestId, "Unhandled error during webhook processing", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    logInfo(requestId, "Webhook processing finished", {
      durationMs: Date.now() - startedAt,
    });
  }
}
