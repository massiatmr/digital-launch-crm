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
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
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
  // extras = paires { label, value } pour préserver l'intitulé original lisible
  const extras: Array<{ label: string; value: string }> = [];

  for (const field of fieldData) {
    const key = field.name.toLowerCase().trim();
    const value = field.values?.[0] ?? "";
    if (!value) continue;

    const target = FIELD_MAP[key];
    if (target && !mapped[target]) {
      mapped[target] = value;
    } else {
      extras.push({ label: prettyLabel(field.name), value: prettyValue(value) });
    }
  }

  return { mapped, extras };
}

// "ville_d'arrivée" → "Ville d'arrivée"
function prettyLabel(raw: string): string {
  let s = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/:+\s*$/g, "").trim();
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// "1_k€_-_2_k€_(lancement)" → "1 k€ - 2 k€ (lancement)"
function prettyValue(raw: string): string {
  let s = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
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

    // Respond immediately to Facebook; resolve page → token+owner inside processWebhook
    const processPromise = processWebhook(body, FB_PAGE_ACCESS_TOKEN ?? "", FB_LEAD_OWNER_ID ?? "", requestId);
    
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
      // Resolve page-specific access token + owner + workspace from meta_pages table
      let effectiveToken = accessToken;
      let effectiveOwnerId = ownerId;
      let effectiveWorkspaceId: string | null = null;
      const pageId = entry?.id ? String(entry.id) : null;

      if (pageId) {
        const { data: metaPage } = await supabase
          .from("meta_pages")
          .select("owner_id, page_access_token, is_active, workspace_id")
          .eq("page_id", pageId)
          .maybeSingle();

        if (metaPage) {
          if (!metaPage.is_active) {
            logInfo(requestId, "Skipping entry — page is inactive", { pageId });
            continue;
          }
          effectiveToken = metaPage.page_access_token;
          effectiveOwnerId = metaPage.owner_id;
          effectiveWorkspaceId = metaPage.workspace_id ?? null;
          logInfo(requestId, "Resolved page from meta_pages", { pageId, owner: effectiveOwnerId, workspace: effectiveWorkspaceId });
        } else {
          logInfo(requestId, "Page not in meta_pages — using env fallback", { pageId });
        }
      }

      if (!effectiveToken || !effectiveOwnerId) {
        logError(requestId, "No token/owner available for page", { pageId });
        continue;
      }

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
              `https://graph.facebook.com/v25.0/${leadgenId}?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id&access_token=${effectiveToken}`
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

        // Format structuré et lisible pour les notes (markdown léger)
        const receivedAt = leadData.created_time ?? new Date().toISOString();
        const lines: string[] = [];
        lines.push("📘 Lead Facebook Ads");
        lines.push("");
        if (extras.length > 0) {
          lines.push("📋 Réponses au formulaire");
          for (const { label, value } of extras) {
            lines.push(`• ${label} : ${value}`);
          }
          lines.push("");
        }
        lines.push("ℹ️ Source");
        lines.push(`• Form ID : ${formId ?? "N/A"}`);
        lines.push(`• Leadgen ID : ${leadgenId}`);
        lines.push(`• Reçu le : ${new Date(receivedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" })}`);
        const notesContent = lines.join("\n");

        let existingLead: LeadLookupResult | null = null;

        if (email) {
          let q = supabase
            .from("leads")
            .select("id, notes")
            .eq("owner_id", effectiveOwnerId)
            .eq("email", email);
          q = effectiveWorkspaceId
            ? q.eq("workspace_id", effectiveWorkspaceId)
            : q.is("workspace_id", null);
          const { data, error } = await q.maybeSingle();

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
          let q = supabase
            .from("leads")
            .select("id, notes")
            .eq("owner_id", effectiveOwnerId)
            .eq("phone", phone);
          q = effectiveWorkspaceId
            ? q.eq("workspace_id", effectiveWorkspaceId)
            : q.is("workspace_id", null);
          const { data, error } = await q.maybeSingle();

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
          // Lookup offer_id from form mapping
          let mappedOfferId: string | null = null;
          if (formId) {
            let mq = supabase
              .from("meta_form_offer_mapping")
              .select("offer_id")
              .eq("form_id", String(formId));
            mq = effectiveWorkspaceId
              ? mq.eq("workspace_id", effectiveWorkspaceId)
              : mq.eq("owner_id", effectiveOwnerId).is("workspace_id", null);
            const { data: mapping } = await mq.maybeSingle();
            mappedOfferId = mapping?.offer_id ?? null;
            if (mappedOfferId) {
              logInfo(requestId, "Form mapped to offer", { formId, offerId: mappedOfferId });
            }
          }

          const insertPayload = {
            name,
            email,
            phone,
            company_name: mapped.company_name ?? "",
            notes: notesContent,
            source: "facebook" as any,
            status: "new" as any,
            score: "cold" as any,
            owner_id: effectiveOwnerId,
            workspace_id: effectiveWorkspaceId,
            offer_id: mappedOfferId,
            message: `Lead Facebook Ads – ${mapped.name ?? "Nouveau lead"}`,
            meta_page_id: pageId,
            meta_form_id: leadData.form_id ?? (formId ? String(formId) : null),
            meta_ad_id: leadData.ad_id ?? null,
            meta_adset_id: leadData.adset_id ?? null,
            meta_campaign_id: leadData.campaign_id ?? null,
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
