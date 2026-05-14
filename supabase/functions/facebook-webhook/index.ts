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
// On distingue le téléphone auto-rempli par Meta (`phone_auto`, contient l'indicatif pays)
// du numéro WhatsApp saisi manuellement par le lead (`phone_wa`).
const FIELD_MAP: Record<string, string> = {
  "full_name": "name",
  "full name": "name",
  "nom_complet": "name",
  "nom complet": "name",
  "name": "name",
  "email": "email",
  "e-mail": "email",
  // Champ auto-rempli Meta (avec indicatif pays)
  "phone_number": "phone_auto",
  "phone": "phone_auto",
  "téléphone": "phone_auto",
  "telephone": "phone_auto",
  // Champ texte WhatsApp saisi par le lead
  "numéro_whatsapp": "phone_wa",
  "numero_whatsapp": "phone_wa",
  "whatsapp": "phone_wa",
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
  // 00XX → +XX (format international avec préfixe d'appel)
  if (p.startsWith("00")) {
    p = "+" + p.slice(2);
  }
  // Si déjà un +, on garde tel quel
  if (p.startsWith("+")) return p;
  // Si commence par 0 (format local), on NE PRÉSUME PAS le pays.
  // On laisse tel quel pour éviter de mettre +33 sur un numéro algérien/marocain/etc.
  if (p.startsWith("0")) return p;
  // Sinon : numéro brut avec indicatif pays sans + (ex: "213559..." venant de Meta) → on préfixe +
  return "+" + p;
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
    const processPromise = processWebhook(body, FB_PAGE_ACCESS_TOKEN ?? "", FB_LEAD_OWNER_ID ?? "", requestId)
      .catch((err) =>
        logError(requestId, "Background processing error", {
          error: err instanceof Error ? err.message : String(err),
        })
      );

    // Keep the isolate alive until background processing completes
    // (without this, Deno kills the worker as soon as the 200 response is returned,
    // and no lead is ever created in the DB).
    try {
      // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processPromise);
      } else {
        await processPromise;
      }
    } catch (_) {
      // ignore
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});

async function processWebhook(body: any, accessToken: string, ownerId: string, requestId: string) {
  const startedAt = Date.now();

  try {
    // Route messages Messenger / Instagram DM avant la logique leadgen historique
    if (body.object === "page" || body.object === "instagram") {
      const hasMessaging = (body.entry ?? []).some(
        (e: any) => Array.isArray(e?.messaging) && e.messaging.length > 0,
      );
      if (hasMessaging) {
        await processMessagingEvents(body, requestId);
        // On ne return pas : une même page peut envoyer aussi des changes leadgen
      }
    }

    if (body.object !== "page") {
      logInfo(requestId, "Skipping non-page event for leadgen", { object: body?.object });
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
        // Priorité au tel auto-rempli Meta (contient l'indicatif pays correct).
        // Fallback : champ WhatsApp saisi manuellement.
        const rawPhone = mapped.phone_auto || mapped.phone_wa || (mapped as any).phone || "";
        const phone = rawPhone ? normalizePhone(rawPhone) : "";
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

// ─────────────────────────────────────────────────────────────────
// Messenger + Instagram DM handler
// ─────────────────────────────────────────────────────────────────
async function processMessagingEvents(body: any, requestId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    logError(requestId, "Missing Supabase creds for messaging");
    return;
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const isInstagram = body.object === "instagram";
  const channel = isInstagram ? "instagram" : "messenger";
  const graphApi = "https://graph.facebook.com/v21.0";

  for (const entry of body.entry ?? []) {
    const recipientPageOrIg = String(entry?.id ?? "");
    if (!recipientPageOrIg) continue;

    // Résoudre l'identité (page_id pour Messenger, instagram_business_account_id pour IG)
    let identityQuery = supabase
      .from("meta_channel_identities")
      .select("id, owner_id, workspace_id, page_id, page_access_token, instagram_business_account_id, instagram_access_token");
    identityQuery = isInstagram
      ? identityQuery.eq("instagram_business_account_id", recipientPageOrIg)
      : identityQuery.eq("page_id", recipientPageOrIg);
    const { data: identity } = await identityQuery.maybeSingle();
    if (!identity) {
      logInfo(requestId, "No channel identity for entry, skipping", { id: recipientPageOrIg, channel });
      continue;
    }

    for (const event of entry.messaging ?? []) {
      try {
        const isEcho = !!event.message?.is_echo;
        const senderId = String(event.sender?.id ?? "");
        const recipientId = String(event.recipient?.id ?? "");
        // L'utilisateur externe = celui qui n'est PAS la page/IG nous
        const externalThreadId = isEcho ? recipientId : senderId;
        if (!externalThreadId) continue;

        // Reads / delivery / postbacks → on n'enregistre pas comme message texte
        if (event.read || event.delivery) continue;

        const direction = isEcho ? "outbound" : "inbound";
        const text = event.message?.text ?? event.postback?.title ?? "";
        const attachments = event.message?.attachments ?? [];
        const content = text || (attachments.length > 0 ? `[${attachments[0]?.type ?? "media"}]` : "");
        if (!content) continue;
        const externalMsgId = event.message?.mid ?? null;
        const sentAtMs = event.timestamp ?? Date.now();

        // Idempotence : skip si on a déjà ce message (même mid)
        if (externalMsgId) {
          const { data: dup } = await supabase
            .from("whatsapp_messages")
            .select("id")
            .eq("wa_message_id", externalMsgId)
            .maybeSingle();
          if (dup) {
            logInfo(requestId, "Duplicate message, skipping", { externalMsgId });
            continue;
          }
        }

        // Helper: récupère le profil utilisateur via Graph API.
        // 1) tente direct PSID/IGSID. 2) fallback via /{page}/conversations?user_id=
        const fetchProfile = async (): Promise<{ name: string | null; pic: string | null; username: string | null }> => {
          let name: string | null = null;
          let picUrl: string | null = null;
          let username: string | null = null;
          // Pour IG, essayer d'abord le token IG dédié si présent, puis fallback sur le page token
          const igToken = (identity as any).instagram_access_token as string | null;
          const tokens: string[] = isInstagram
            ? [igToken, identity.page_access_token].filter(Boolean) as string[]
            : [identity.page_access_token];

          const fields = isInstagram
            ? "name,username,profile_pic"
            : "name,first_name,last_name,profile_pic,picture";

          let workingToken: string | null = null;
          for (const tok of tokens) {
            try {
              const r = await fetch(`${graphApi}/${externalThreadId}?fields=${fields}&access_token=${tok}`);
              const j = await r.json();
              if (j?.error) {
                logInfo(requestId, "Direct profile fetch error", { externalThreadId, err: j.error, tokenKind: tok === igToken ? "ig" : "page" });
                continue;
              }
              picUrl = j?.profile_pic ?? j?.picture?.data?.url ?? picUrl;
              username = j?.username ?? username;
              name = isInstagram
                ? (j?.name || j?.username || null)
                : (j?.name || [j?.first_name, j?.last_name].filter(Boolean).join(" ").trim() || null);
              workingToken = tok;
              if (name) break;
            } catch (e) {
              logInfo(requestId, "Profile fetch threw", { externalThreadId, e: String(e) });
            }
          }

          // Fallback : /{page_id}/conversations?platform=&user_id= renvoie les participants avec leur nom
          if (!name && identity.page_id) {
            const platform = isInstagram ? "instagram" : "messenger";
            const fallbackTokens = workingToken ? [workingToken] : tokens;
            for (const tok of fallbackTokens) {
              try {
                const r2 = await fetch(
                  `${graphApi}/${identity.page_id}/conversations?platform=${platform}&user_id=${externalThreadId}&fields=participants&access_token=${tok}`,
                );
                const j2 = await r2.json();
                if (j2?.error) {
                  logInfo(requestId, "Conversations fallback error", { err: j2.error });
                  continue;
                }
                const conv = j2?.data?.[0];
                const participant = conv?.participants?.data?.find((p: any) => p?.id === externalThreadId);
                if (participant?.name) {
                  name = participant.name;
                  logInfo(requestId, "Profile resolved via conversations fallback", { externalThreadId, name });
                  break;
                }
              } catch (e) {
                logInfo(requestId, "Conversations fallback threw", { e: String(e) });
              }
            }
          }

          return { name, pic: picUrl, username };
        };

        // Trouve un lead existant du workspace par nom (case-insensitive) pour éviter les doublons cross-canal
        const findExistingLeadByName = async (candidateName: string): Promise<string | null> => {
          if (!candidateName) return null;
          const trimmed = candidateName.trim();
          if (!trimmed || /^Lead (Messenger|Instagram)$/i.test(trimmed)) return null;
          const { data } = await supabase
            .from("leads")
            .select("id, name, source")
            .eq("workspace_id", identity.workspace_id)
            .is("deleted_at", null)
            .ilike("name", trimmed)
            .limit(1);
          return (data && data[0]?.id) || null;
        };

        // Trouver ou créer le lead
        let leadId: string | null = null;
        const { data: existingMsg } = await supabase
          .from("whatsapp_messages")
          .select("lead_id")
          .eq("channel", channel)
          .eq("external_thread_id", externalThreadId)
          .limit(1)
          .maybeSingle();
        if (existingMsg) {
          leadId = existingMsg.lead_id;
          // Upgrade : si le lead existant porte encore le nom par défaut, on retente la résolution
          const { data: leadRow } = await supabase
            .from("leads")
            .select("name")
            .eq("id", leadId)
            .maybeSingle();
          const currentName = (leadRow as any)?.name as string | undefined;
          if (currentName && /^(Lead Messenger|Lead Instagram)$/i.test(currentName.trim())) {
            const prof = await fetchProfile();
            if (prof.name) {
              await supabase
                .from("leads")
                .update({ name: prof.name } as any)
                .eq("id", leadId);
              logInfo(requestId, "Lead name upgraded from profile", { leadId, name: prof.name });
            }
          }
        } else {
          const prof = await fetchProfile();
          const fallback = isInstagram ? "Lead Instagram" : "Lead Messenger";
          const displayName = prof.name || fallback;

          // Dédup cross-canal : si un lead du workspace porte déjà ce nom, on le réutilise
          if (prof.name) {
            const matched = await findExistingLeadByName(prof.name);
            if (matched) {
              leadId = matched;
              const { data: leadRow } = await supabase.from("leads").select("notes").eq("id", matched).maybeSingle();
              const prevNotes = ((leadRow as any)?.notes ?? "").toString();
              const channelLabel = channel === "instagram" ? "Instagram DM" : "Messenger";
              const noteAppend =
                `\n\n📥 Nouveau canal : ${channelLabel}` +
                (prof.username ? ` @${prof.username}` : "") +
                `\n• Identifiant ${channel} : ${externalThreadId}`;
              await supabase
                .from("leads")
                .update({ notes: (prevNotes + noteAppend).trim() } as any)
                .eq("id", matched);
              logInfo(requestId, "Linked new channel thread to existing lead", { leadId: matched, channel, name: prof.name });
            }
          }

          if (!leadId) {
            const noteLines: string[] = [];
            noteLines.push(`📥 Conversation ${channel === "instagram" ? "Instagram DM" : "Messenger"}`);
            if (prof.username) noteLines.push(`• @${prof.username}`);
            noteLines.push(`• Identifiant : ${externalThreadId}`);
            if (prof.pic) noteLines.push(`• Photo : ${prof.pic}`);

            const { data: newLead, error: insErr } = await supabase
              .from("leads")
              .insert({
                name: displayName,
                email: "",
                phone: "",
                source: channel as any,
                status: "new" as any,
                score: "cold" as any,
                owner_id: identity.owner_id,
                workspace_id: identity.workspace_id,
                message: `Nouveau message ${channel}`,
                notes: noteLines.join("\n"),
                meta_page_id: identity.page_id,
              } as any)
              .select("id")
              .maybeSingle();
            if (insErr || !newLead) {
              logError(requestId, "Lead creation failed for messaging", { error: insErr?.message });
              continue;
            }
            leadId = newLead.id;

            try {
              await supabase.functions.invoke("notify-new-lead", { body: { lead_id: leadId } });
            } catch (e) {
              logError(requestId, "notify-new-lead failed", { e: String(e) });
            }
          }
        }

        // Insérer le message
        await supabase.from("whatsapp_messages").insert({
          lead_id: leadId,
          owner_id: identity.owner_id,
          workspace_id: identity.workspace_id,
          direction: direction as any,
          content,
          channel: channel as any,
          external_thread_id: externalThreadId,
          wa_message_id: externalMsgId,
          status: "sent",
          sent_at: new Date(sentAtMs).toISOString(),
        } as any);

        // === Détection / demande automatique du nom (Messenger / Instagram) ===
        // Sur les canaux Meta, le profil n'est souvent pas accessible (App en Dev mode,
        // permission instagram_manage_messages non approuvée). On demande le prénom au
        // prospect dès le 1er inbound, puis on parse sa réponse pour mettre à jour le lead.
        if (direction === "inbound" && leadId) {
          try {
            const { data: leadRow } = await supabase
              .from("leads").select("name").eq("id", leadId).maybeSingle();
            const currentName = ((leadRow as any)?.name ?? "").toString().trim();
            const isFallbackName = /^(Lead Messenger|Lead Instagram)$/i.test(currentName);

            if (isFallbackName) {
              // A-t-on déjà demandé le nom ?
              const { data: priorAsk } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("lead_id", leadId)
                .eq("direction", "outbound")
                .contains("metadata", { name_request: true } as any)
                .limit(1)
                .maybeSingle();

              if (!priorAsk) {
                // Premier inbound -> on demande le prénom via Graph API directement
                const askText = "Salut 👋 ravi d'avoir ton message ! Pour bien te répondre, comment puis-je t'appeler ? (juste ton prénom 🙂)";
                const igToken = (identity as any).instagram_access_token as string | null;
                const sendToken = isInstagram ? (igToken || identity.page_access_token) : identity.page_access_token;
                const endpoint = isInstagram && (identity as any).instagram_business_account_id
                  ? `${graphApi}/${(identity as any).instagram_business_account_id}/messages`
                  : `${graphApi}/me/messages`;
                try {
                  const r = await fetch(`${endpoint}?access_token=${sendToken}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: externalThreadId },
                      messaging_type: "RESPONSE",
                      message: { text: askText },
                    }),
                  });
                  const j = await r.json().catch(() => ({}));
                  await supabase.from("whatsapp_messages").insert({
                    lead_id: leadId,
                    owner_id: identity.owner_id,
                    workspace_id: identity.workspace_id,
                    direction: "outbound",
                    content: askText,
                    channel: channel as any,
                    external_thread_id: externalThreadId,
                    wa_message_id: j?.message_id ?? null,
                    status: r.ok ? "sent" : "failed",
                    error_message: r.ok ? null : JSON.stringify(j?.error ?? j).slice(0, 500),
                    metadata: { name_request: true } as any,
                  } as any);
                  logInfo(requestId, "Name request sent", { leadId, channel });
                } catch (e) {
                  logError(requestId, "Name request failed", { e: String(e) });
                }
              } else {
                // On a déjà demandé -> ce inbound est probablement le prénom
                const candidate = (content || "").trim().split(/\r?\n/)[0].trim();
                // Heuristique simple : 2-60 chars, pas d'URL, principalement lettres/espaces/-/'
                const looksLikeName =
                  candidate.length >= 2 &&
                  candidate.length <= 60 &&
                  !/https?:\/\//i.test(candidate) &&
                  /^[\p{L}][\p{L}\s'\-.]{1,59}$/u.test(candidate);
                if (looksLikeName) {
                  // Nettoyage : retire "moi c'est", "je m'appelle", "c'est"
                  const cleaned = candidate
                    .replace(/^(moi\s+c['e]?\s*est|je\s+m['e]?\s*appelle|c['e]?\s*est|my\s+name\s+is|i['']?m)\s+/i, "")
                    .replace(/[.!?]+$/g, "")
                    .trim();
                  const finalName = (cleaned || candidate).slice(0, 60);
                  await supabase
                    .from("leads")
                    .update({ name: finalName } as any)
                    .eq("id", leadId);
                  logInfo(requestId, "Lead name set from prospect reply", { leadId, name: finalName });
                }
              }
            }
          } catch (e) {
            logError(requestId, "Name auto-detection failed", { e: String(e) });
          }
        }

        logInfo(requestId, "Messaging event stored", {
          channel,
          direction,
          leadId,
          externalThreadId,
          isEcho,
        });
      } catch (e) {
        logError(requestId, "Messaging event handling failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
