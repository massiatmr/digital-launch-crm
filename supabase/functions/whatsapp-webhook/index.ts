// Public WhatsApp Cloud API webhook (no JWT)
// GET = handshake (verify_token lookup in DB)
// POST = inbound message → insert into whatsapp_messages + push notif owner
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  try {
    const body = await req.json();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;
        const phone_number_id = value.metadata?.phone_number_id;
        if (!phone_number_id) continue;

        const { data: cfg } = await admin
          .from("whatsapp_config")
          .select("owner_id, is_active, workspace_id")
          .eq("phone_number_id", phone_number_id)
          .maybeSingle();
        if (!cfg || !cfg.is_active) continue;

        // Récupérer access_token pour téléchargement média
        const { data: cfgFull } = await admin
          .from("whatsapp_config")
          .select("access_token")
          .eq("phone_number_id", phone_number_id)
          .maybeSingle();
        const accessToken = cfgFull?.access_token;

        for (const msg of value.messages) {
          const from = normalizePhone(msg.from);
          let content =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            `[${msg.type}]`;

          // Gestion média (audio/voice)
          let mediaType: string | null = null;
          let mediaStoragePath: string | null = null;
          let transcript: string | null = null;
          let durationSeconds: number | null = null;
          const mediaPayload = msg.audio ?? msg.voice;
          if ((msg.type === "audio" || msg.type === "voice") && mediaPayload?.id && accessToken) {
            try {
              mediaType = mediaPayload.mime_type ?? "audio/ogg";
              // 1. Récupérer URL temporaire Meta
              const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaPayload.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const metaJson = await metaRes.json();
              const mediaUrl = metaJson?.url;
              if (mediaUrl) {
                // 2. Télécharger le binaire
                const audioRes = await fetch(mediaUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                const audioBuf = new Uint8Array(await audioRes.arrayBuffer());
                // 3. Upload vers storage
                const ext = mediaType.includes("mpeg") ? "mp3" : mediaType.includes("wav") ? "wav" : "ogg";
                const path = `inbound/${cfg.owner_id}/${msg.id}.${ext}`;
                const { error: upErr } = await admin.storage
                  .from("wa-audio")
                  .upload(path, audioBuf, { contentType: mediaType, upsert: true });
                if (!upErr) mediaStoragePath = path;

                // 4. Transcription via Lovable AI (Gemini supporte l'audio inline)
                const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
                if (LOVABLE_API_KEY) {
                  try {
                    // base64 encode
                    let binary = "";
                    for (let i = 0; i < audioBuf.length; i++) binary += String.fromCharCode(audioBuf[i]);
                    const b64 = btoa(binary);
                    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${LOVABLE_API_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "google/gemini-2.5-flash",
                        messages: [
                          {
                            role: "system",
                            content:
                              "Tu es un transcripteur audio. Transcris fidèlement le message vocal dans sa langue d'origine (français, anglais, arabe, espagnol, etc.). Renvoie UNIQUEMENT le texte transcrit, sans commentaire ni guillemets.",
                          },
                          {
                            role: "user",
                            content: [
                              { type: "text", text: "Transcris ce vocal :" },
                              {
                                type: "input_audio",
                                input_audio: { data: b64, format: ext === "mp3" ? "mp3" : "ogg" },
                              },
                            ],
                          },
                        ],
                      }),
                    });
                    const aiJson = await aiRes.json();
                    transcript = aiJson?.choices?.[0]?.message?.content?.trim() || null;
                    if (transcript) content = transcript;
                  } catch (trErr) {
                    console.error("transcription error:", trErr);
                  }
                }
              }
            } catch (mErr) {
              console.error("media handling error:", mErr);
            }
          }

          const tail = from.slice(-9);
          let leadQuery = admin
            .from("leads")
            .select("id, name, workspace_id")
            .ilike("phone", `%${tail}%`)
            .limit(1);
          if (cfg.workspace_id) {
            leadQuery = leadQuery.eq("workspace_id", cfg.workspace_id);
          } else {
            leadQuery = leadQuery.eq("owner_id", cfg.owner_id);
          }
          const { data: leads } = await leadQuery;
          const lead = leads?.[0];
          if (!lead) continue;

          await admin.from("whatsapp_messages").insert({
            lead_id: lead.id,
            owner_id: cfg.owner_id,
            workspace_id: cfg.workspace_id ?? lead.workspace_id ?? null,
            direction: "inbound",
            content,
            wa_message_id: msg.id,
            sent_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
            status: "received",
            media_type: mediaType,
            media_storage_path: mediaStoragePath,
            transcript,
            duration_seconds: durationSeconds,
          } as any);

          // Qualification IA en fire-and-forget
          fetch(`${SUPABASE_URL}/functions/v1/qualify-conversation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ lead_id: lead.id }),
          }).catch((e) => console.error("qualify-conversation invoke failed:", e));

          // Push notif via OneSignal
          try {
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
