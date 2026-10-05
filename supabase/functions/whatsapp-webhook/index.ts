// Public WhatsApp Cloud API webhook (no JWT)
// GET = handshake (verify_token lookup in DB)
// POST = inbound message → insert into whatsapp_messages + push notif owner
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { trySwitchToWorkPhone, requeueTask } from "../_shared/workPhoneFallback.ts";
import { getMutedUserIds } from "../_shared/notificationPrefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, "");
}

async function verifyMetaSignature(appSecret: string, rawBody: string, header: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice(7).toLowerCase();
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (computed.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token) return new Response("Forbidden", { status: 403 });
    const { data } = await admin
      .from("whatsapp_config")
      .select("id")
      .eq("verify_token", token)
      .maybeSingle();
    if (!data) return new Response("Forbidden", { status: 403 });
    return new Response(challenge ?? "", { status: 200 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Read raw body (we need it for HMAC), then peek phone_number_id to pick the right app_secret
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") || "";

  let parsedBody: any;
  try { parsedBody = JSON.parse(rawBody); } catch { return new Response("Bad Request", { status: 400 }); }

  // Find the first phone_number_id mentioned in the payload (Meta groups changes per WABA entry, all sharing same number_id)
  let firstPhoneNumberId: string | null = null;
  outer: for (const entry of parsedBody.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const pid = change?.value?.metadata?.phone_number_id;
      if (pid) { firstPhoneNumberId = pid; break outer; }
    }
  }

  // Look up config to determine which app_secret to use for HMAC
  let dedicatedAppSecret: string | null = null;
  if (firstPhoneNumberId) {
    const { data: cfgRow } = await admin
      .from("whatsapp_config")
      .select("connection_mode, app_secret")
      .eq("phone_number_id", firstPhoneNumberId)
      .order("is_active", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgRow && (cfgRow as any).connection_mode === "dedicated" && (cfgRow as any).app_secret) {
      dedicatedAppSecret = (cfgRow as any).app_secret;
    }
  }

  const globalAppSecret = Deno.env.get("FB_APP_SECRET") || "";
  const secretToUse = dedicatedAppSecret || globalAppSecret;
  if (!secretToUse) {
    console.error("No app secret available (neither dedicated nor FB_APP_SECRET) — rejecting");
    return new Response("Forbidden", { status: 403 });
  }
  const sigOk = await verifyMetaSignature(secretToUse, rawBody, sigHeader);
  if (!sigOk) {
    console.error("Invalid X-Hub-Signature-256 — rejecting webhook");
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = parsedBody;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phone_number_id = value?.metadata?.phone_number_id;
        if (!phone_number_id) continue;

        // Récupère config (active prioritaire)
        const { data: cfgs, error: cfgErr } = await admin
          .from("whatsapp_config")
          .select("owner_id, is_active, workspace_id, access_token, phone_number_id")
          .eq("phone_number_id", phone_number_id)
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1);
        if (cfgErr) { console.error("whatsapp_config lookup error:", cfgErr); continue; }
        const cfg = cfgs?.[0];
        if (!cfg) { console.warn(`No whatsapp_config for ${phone_number_id}`); continue; }
        if (!cfg.is_active) continue;
        const accessToken = cfg.access_token;


        // ====== STATUSES (sent/delivered/read/failed) ======
        if (value.statuses) {
          for (const st of value.statuses) {
            const waId = st.id;
            const status = st.status; // sent | delivered | read | failed
            if (!waId) continue;
            const ts = st.timestamp ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
            const update: any = {};
            if (status === "delivered") update.delivered_at = ts;
            else if (status === "read") { update.read_at = ts; update.delivered_at = ts; }
            else if (status === "failed") { update.status = "failed"; update.error_message = JSON.stringify(st.errors || st); }
            else if (status === "sent") update.status = "sent";
            if (Object.keys(update).length) {
              const { data: existingMsg } = await admin
                .from("whatsapp_messages")
                .select("id, task_id, lead_id, owner_id, workspace_id")
                .eq("wa_message_id", waId)
                .maybeSingle();
              await (admin.from("whatsapp_messages") as any).update(update).eq("wa_message_id", waId);

              // Meta peut accepter l'envoi puis renvoyer ensuite "failed/undeliverable".
              // Avant, la tâche restait marquée envoyée: l'automatisation croyait avoir
              // contacté le lead alors qu'aucun message n'était arrivé.
              let switchedToWork = false;
              if (status === "failed" && (existingMsg as any)?.lead_id) {
                const errText0 = JSON.stringify(st.errors || st);
                const newPhone = await trySwitchToWorkPhone(admin, (existingMsg as any).lead_id, errText0);
                if (newPhone && (existingMsg as any)?.task_id) {
                  await admin.from("lead_followup_tasks").update({
                    status: "failed", error_message: `Échec sur numéro principal, renvoi sur Work Phone`, updated_at: new Date().toISOString(),
                  } as any).eq("id", (existingMsg as any).task_id);
                  switchedToWork = await requeueTask(admin, (existingMsg as any).task_id);
                }
              }
              if (status === "failed" && (existingMsg as any)?.task_id && !switchedToWork) {
                const errorText = JSON.stringify(st.errors || st).slice(0, 1000);
                await admin.from("lead_followup_tasks").update({
                  status: "failed",
                  error_message: errorText,
                  updated_at: new Date().toISOString(),
                } as any).eq("id", (existingMsg as any).task_id);

                const { data: existingManual } = await admin
                  .from("lead_followup_tasks")
                  .select("id")
                  .eq("lead_id", (existingMsg as any).lead_id)
                  .eq("task_type", "manual_call")
                  .in("status", ["pending", "scheduled"])
                  .limit(1);
                if (!existingManual?.length) {
                  await admin.from("lead_followup_tasks").insert({
                    lead_id: (existingMsg as any).lead_id,
                    owner_id: (existingMsg as any).owner_id,
                    workspace_id: (existingMsg as any).workspace_id ?? null,
                    task_type: "manual_call",
                    status: "pending",
                    scheduled_at: new Date().toISOString(),
                    step_order: 98,
                    error_message: `Fallback manuel: message WhatsApp non délivré (${errorText.slice(0, 180)})`,
                  } as any);
                }
              }
            }
          }
          continue;
        }

        // ====== CALLS (Calling API beta) ======
        if (value.calls) {
          for (const call of value.calls) {
            const waCallId = call.id;
            const event = call.event; // ringing | accepted | terminated | failed
            const fromPhone = (call.from || "").replace(/[^0-9]/g, "");
            const tail = fromPhone.slice(-9);

            // Trouver le lead
            let leadQuery = admin.from("leads").select("id, name, workspace_id").ilike("phone", `%${tail}%`).limit(1);
            if (cfg.workspace_id) leadQuery = leadQuery.eq("workspace_id", cfg.workspace_id);
            else leadQuery = leadQuery.eq("owner_id", cfg.owner_id);
            const { data: leadsArr } = await leadQuery;
            const lead = leadsArr?.[0];

            if (event === "ringing") {
              if (!lead) continue;
              // Crée call inbound ringing
              const { data: existing } = await admin.from("whatsapp_calls").select("id").eq("wa_call_id", waCallId).maybeSingle();
              if (!existing) {
                await admin.from("whatsapp_calls").insert({
                  lead_id: lead.id,
                  owner_id: cfg.owner_id,
                  workspace_id: cfg.workspace_id ?? lead.workspace_id ?? null,
                  direction: "inbound",
                  status: "ringing",
                  wa_call_id: waCallId,
                } as any);
              }
              // Push notif "appel entrant"
              try {
                const wsForMute = cfg.workspace_id ?? lead.workspace_id ?? null;
                const mutedPush = await getMutedUserIds(admin, wsForMute, [cfg.owner_id], "push");
                if (!mutedPush.has(cfg.owner_id)) {
                  await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
                    body: JSON.stringify({
                      user_id: cfg.owner_id,
                      title: `📞 Appel WhatsApp — ${lead.name}`,
                      body: "Appel entrant en cours…",
                      url: `/conversations?lead=${lead.id}&call=${waCallId}`,
                      tag: `wa-call-${waCallId}`.slice(0, 32),
                    }),
                  });
                }
              } catch (e) { console.error("call ringing push", e); }
            } else if (event === "accepted") {
              await (admin.from("whatsapp_calls") as any).update({ status: "answered", answered_at: new Date().toISOString() }).eq("wa_call_id", waCallId);
            } else if (event === "terminated" || event === "failed") {
              const { data: existing } = await admin.from("whatsapp_calls").select("status, answered_at").eq("wa_call_id", waCallId).maybeSingle();
              const wasAnswered = !!(existing as any)?.answered_at;
              const finalStatus = event === "failed" ? "failed" : (wasAnswered ? "ended" : "missed");
              const update: any = { status: finalStatus, ended_at: new Date().toISOString() };
              if (wasAnswered && (existing as any)?.answered_at) {
                update.duration_seconds = Math.round((Date.now() - new Date((existing as any).answered_at).getTime()) / 1000);
              }
              await (admin.from("whatsapp_calls") as any).update(update).eq("wa_call_id", waCallId);

              // Si missed → push notif appel manqué
              if (finalStatus === "missed" && lead) {
                try {
                  const wsForMute = cfg.workspace_id ?? lead.workspace_id ?? null;
                  const mutedPush = await getMutedUserIds(admin, wsForMute, [cfg.owner_id], "push");
                  if (!mutedPush.has(cfg.owner_id)) {
                    await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
                      body: JSON.stringify({
                        user_id: cfg.owner_id,
                        title: `📵 Appel manqué — ${lead.name}`,
                        body: "Tape pour rappeler",
                        url: `/leads/${lead.id}`,
                        tag: `wa-missed-${lead.id}`.slice(0, 32),
                      }),
                    });
                  }
                } catch (e) { console.error("missed call push", e); }
              }
            }
          }
          continue;
        }

        if (!value?.messages) continue;

        for (const msg of value.messages) {
          const from = normalizePhone(msg.from);

          // ====== REACTIONS ======
          if (msg.type === "reaction" && msg.reaction?.message_id) {
            const targetWaId = msg.reaction.message_id;
            const emoji = msg.reaction.emoji || "";
            const { data: target } = await admin.from("whatsapp_messages").select("id, reactions").eq("wa_message_id", targetWaId).maybeSingle();
            if (target) {
              const list = Array.isArray((target as any).reactions) ? [...(target as any).reactions] : [];
              const filtered = list.filter((r: any) => r.by !== from);
              if (emoji) filtered.push({ emoji, by: from, by_kind: "lead", at: new Date().toISOString() });
              await (admin.from("whatsapp_messages") as any).update({ reactions: filtered }).eq("id", (target as any).id);
            }
            continue;
          }

          let content =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            msg.image?.caption ??
            msg.video?.caption ??
            msg.document?.caption ??
            (msg.type === "image" ? "[Photo]" :
             msg.type === "video" ? "[Vidéo]" :
             msg.type === "document" ? "[Document]" :
             msg.type === "sticker" ? "[Sticker]" :
             msg.type === "location" ? "[Localisation]" :
             `[${msg.type}]`);

          // Normalisation type
          let messageType = "text";
          if (msg.type === "image") messageType = "image";
          else if (msg.type === "video") messageType = "video";
          else if (msg.type === "document") messageType = "document";
          else if (msg.type === "sticker") messageType = "sticker";
          else if (msg.type === "audio" || msg.type === "voice") messageType = "audio";

          let mediaType: string | null = null;
          let mediaStoragePath: string | null = null;
          let mediaFilename: string | null = null;
          let mediaSize: number | null = null;
          let transcript: string | null = null;
          let durationSeconds: number | null = null;

          // ====== MÉDIAS (audio/voice + image/video/document/sticker) ======
          const mediaPayload = msg.audio ?? msg.voice ?? msg.image ?? msg.video ?? msg.document ?? msg.sticker;
          if (mediaPayload?.id && accessToken) {
            try {
              mediaType = mediaPayload.mime_type ?? "application/octet-stream";
              mediaFilename = mediaPayload.filename ?? null;
              const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaPayload.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const metaJson = await metaRes.json();
              const mediaUrl = metaJson?.url;
              if (mediaUrl) {
                const binRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
                const buf = new Uint8Array(await binRes.arrayBuffer());
                mediaSize = buf.byteLength;

                if (messageType === "audio") {
                  const ext = mediaType.includes("mpeg") ? "mp3" : mediaType.includes("wav") ? "wav" : "ogg";
                  const path = `inbound/${cfg.owner_id}/${msg.id}.${ext}`;
                  const { error: upErr } = await admin.storage.from("wa-audio").upload(path, buf, { contentType: mediaType, upsert: true });
                  if (!upErr) mediaStoragePath = path;

                  // Transcription IA (déjà en place)
                  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
                  if (LOVABLE_API_KEY) {
                    try {
                      let binary = "";
                      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
                      const b64 = btoa(binary);
                      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                          model: "google/gemini-2.5-flash",
                          messages: [
                            { role: "system", content: "Tu es un transcripteur audio. Transcris fidèlement le message vocal dans sa langue d'origine. Renvoie UNIQUEMENT le texte transcrit." },
                            { role: "user", content: [
                              { type: "text", text: "Transcris ce vocal :" },
                              { type: "input_audio", input_audio: { data: b64, format: ext === "mp3" ? "mp3" : "ogg" } },
                            ]},
                          ],
                        }),
                      });
                      const aiJson = await aiRes.json();
                      transcript = aiJson?.choices?.[0]?.message?.content?.trim() || null;
                      if (transcript) content = transcript;
                    } catch (trErr) { console.error("transcription error:", trErr); }
                  }
                } else {
                  // image / video / document / sticker → bucket wa-media
                  const fallbackExt = mediaType.split("/")[1]?.split(";")[0] || "bin";
                  const safeName = mediaFilename ? mediaFilename.replace(/[^\w.\-]/g, "_") : `${msg.id}.${fallbackExt}`;
                  const path = `${cfg.owner_id}/inbound-${Date.now()}-${safeName}`;
                  const { error: upErr } = await admin.storage.from("wa-media").upload(path, buf, { contentType: mediaType, upsert: true });
                  if (!upErr) mediaStoragePath = path;
                }
              }
            } catch (mErr) { console.error("media handling error:", mErr); }
          }

          // ====== REPLY CONTEXT ======
          const replyToWaId = msg.context?.id || null;
          let replySnapshot: any = null;
          if (replyToWaId) {
            const { data: orig } = await admin.from("whatsapp_messages").select("content, direction, message_type").eq("wa_message_id", replyToWaId).maybeSingle();
            if (orig) {
              replySnapshot = {
                wa_id: replyToWaId,
                direction: (orig as any).direction,
                excerpt: ((orig as any).content || "").slice(0, 120),
                type: (orig as any).message_type,
              };
            }
          }

          const tail = from.slice(-9);
          let leadQuery = admin.from("leads").select("id, name, workspace_id").ilike("phone", `%${tail}%`).limit(1);
          if (cfg.workspace_id) leadQuery = leadQuery.eq("workspace_id", cfg.workspace_id);
          else leadQuery = leadQuery.eq("owner_id", cfg.owner_id);
          const { data: leads } = await leadQuery;
          let lead = leads?.[0];

          // Profile name from WA contacts payload (utile pour la dédup par nom)
          const profileName: string | null = (() => {
            try {
              const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
              const match = contacts.find((c: any) => normalizePhone(c?.wa_id || "") === from);
              const n = (match?.profile?.name || "").toString().trim();
              return n.length >= 3 ? n : null;
            } catch { return null; }
          })();

          // Fallback dédup : match par nom OU par raison sociale (company_name) sur leads récents (7j) du même workspace.
          // Couvre form Facebook / Messenger arrivés juste avant le WhatsApp, y compris quand le profil WA
          // est le nom commercial (ex: "DLR TRANSPORT" vs lead "Seydou Ali" / company "DLR Transport").
          if (!lead && profileName) {
            const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            let nq = admin
              .from("leads")
              .select("id, name, workspace_id, phone, company_name")
              .or(`name.ilike.${profileName},company_name.ilike.${profileName}`)
              .is("deleted_at", null)
              .gte("created_at", since7d)
              .order("created_at", { ascending: false })
              .limit(1);
            if (cfg.workspace_id) nq = nq.eq("workspace_id", cfg.workspace_id);
            else nq = nq.eq("owner_id", cfg.owner_id);
            const { data: nameMatch } = await nq.maybeSingle();
            if (nameMatch) {
              lead = nameMatch as any;
              if (!(nameMatch as any).phone) {
                await (admin.from("leads") as any).update({ phone: `+${from}` }).eq("id", (nameMatch as any).id);
              }
              console.log("WA dedup: linked inbound to existing lead by name/company", { leadId: (nameMatch as any).id, profileName });
            }
          }

          // Auto-create lead from unknown WhatsApp number
          if (!lead) {
            const displayPhone = `+${from}`;
            const { data: created, error: createErr } = await admin
              .from("leads")
              .insert({
                name: profileName || displayPhone,
                phone: displayPhone,
                source: "whatsapp",
                status: "new",
                score: "cold",
                owner_id: cfg.owner_id,
                workspace_id: cfg.workspace_id ?? null,
                notes: "Lead créé automatiquement depuis un message WhatsApp entrant.",
              } as any)
              .select("id, name, workspace_id")
              .maybeSingle();
            if (createErr || !created) {
              console.error("auto-create lead failed:", createErr);
              continue;
            }
            lead = created as any;
          }

          await admin.from("whatsapp_messages").insert({
            lead_id: lead.id,
            owner_id: cfg.owner_id,
            workspace_id: cfg.workspace_id ?? lead.workspace_id ?? null,
            direction: "inbound",
            content,
            wa_message_id: msg.id,
            sent_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
            status: "received",
            message_type: messageType,
            media_type: mediaType,
            media_storage_path: mediaStoragePath,
            media_filename: mediaFilename,
            media_size_bytes: mediaSize,
            transcript,
            duration_seconds: durationSeconds,
            reply_to_wa_id: replyToWaId,
            reply_to_snapshot: replySnapshot,
          } as any);

          // Gate IA par feature flag workspace "conversations"
          const wsIdForFeat = cfg.workspace_id ?? lead.workspace_id ?? null;
          let aiAllowed = true;
          if (wsIdForFeat) {
            const { data: feat } = await admin
              .from("workspace_features")
              .select("enabled")
              .eq("workspace_id", wsIdForFeat)
              .eq("feature_key", "conversations")
              .maybeSingle();
            if (feat && feat.enabled === false) aiAllowed = false;
          }

          if (aiAllowed) {
            // Qualification IA en fire-and-forget
            fetch(`${SUPABASE_URL}/functions/v1/qualify-conversation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ lead_id: lead.id }),
            }).catch((e) => console.error("qualify-conversation invoke failed:", e));

            // Détection auto de RDV confirmé (fire-and-forget)
            fetch(`${SUPABASE_URL}/functions/v1/detect-booking-from-conversation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ lead_id: lead.id }),
            }).catch((e) => console.error("detect-booking invoke failed:", e));
          } else {
            console.log("[whatsapp-webhook] conversations feature disabled, skipping IA", { workspace_id: wsIdForFeat, lead_id: lead.id });
          }

          // Push notif via OneSignal (respecte la mute par workspace)
          try {
            const wsForMute = cfg.workspace_id ?? lead.workspace_id ?? null;
            const mutedPush = await getMutedUserIds(admin, wsForMute, [cfg.owner_id], "push");
            if (!mutedPush.has(cfg.owner_id)) {
              const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  user_id: cfg.owner_id,
                  title: `💬 WhatsApp CRM — ${lead.name}`,
                  body: content.slice(0, 140),
                  url: `/conversations?lead=${lead.id}&highlight=1`,
                  tag: `wa-${lead.id}`.slice(0, 32),
                }),
              });
              const txt = await pushRes.text();
              let pushJson: any = null;
              try {
                pushJson = JSON.parse(txt);
              } catch {
                pushJson = null;
              }
              if (pushRes.ok && pushJson?.ok !== false) {
                console.log(`OneSignal push for wa msg ${msg.id}: ${pushRes.status} ${txt}`);
              } else {
                console.error(`OneSignal push failed for wa msg ${msg.id}: ${pushRes.status} ${txt}`);
              }
            }
          } catch (pushErr) {
            console.error("Push error:", pushErr);
          }
        }
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (e) {
    console.error("whatsapp-webhook error:", e);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
});
