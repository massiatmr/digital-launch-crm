// Envoie un message vocal WhatsApp (audio natif) à un lead
// Reçoit l'audio en base64 (webm/ogg/mp3), l'upload vers Meta puis envoie le message
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p.replace(/^\+/, "");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const { lead_id, audio_base64, mime_type } = await req.json();
    if (!lead_id || !audio_base64) {
      return new Response(JSON.stringify({ error: "Missing lead_id or audio_base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead)
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const audioBytes = b64ToBytes(audio_base64);

    // Détection du conteneur réel envoyé par le navigateur.
    // Meta WhatsApp accepte pour les vocaux : audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (codecs=opus).
    // Le navigateur produit en général audio/webm;codecs=opus → Meta REJETTE webm.
    // On déclare donc audio/ogg (le payload opus est compatible avec le conteneur ogg côté Meta dans la majorité des cas).
    const inputMt = (mime_type || "").toLowerCase();
    const isMp3 = inputMt.includes("mpeg") || inputMt.includes("mp3");
    const isMp4 = inputMt.includes("mp4") || inputMt.includes("aac");
    let metaMime: string;
    let ext: string;
    if (isMp3) { metaMime = "audio/mpeg"; ext = "mp3"; }
    else if (isMp4) { metaMime = "audio/mp4"; ext = "m4a"; }
    else { metaMime = "audio/ogg"; ext = "ogg"; }

    console.log(`[send-whatsapp-audio] input=${inputMt} → meta=${metaMime} ext=${ext} size=${audioBytes.length}`);

    // Stockage local pour relecture dans le CRM
    const storagePath = `outbound/${user.id}/${crypto.randomUUID()}.${ext}`;
    await admin.storage
      .from("wa-audio")
      .upload(storagePath, audioBytes, { contentType: metaMime, upsert: false })
      .catch((e) => console.error("storage upload error:", e));

    const { data: settings } = await admin
      .from("followup_automation_settings")
      .select("dry_run")
      .eq("owner_id", user.id)
      .maybeSingle();
    const dryRun = settings?.dry_run !== false;

    let waMessageId: string | null = null;
    let errorMessage: string | null = null;
    let logStatus = dryRun ? "dry_run" : "sent";

    if (!dryRun) {
      let configQuery = admin
        .from("whatsapp_config")
        .select("*")
        .eq("is_active", true);
      if (lead.workspace_id) configQuery = configQuery.eq("workspace_id", lead.workspace_id);
      else configQuery = configQuery.eq("owner_id", lead.owner_id).is("workspace_id", null);
      const { data: config } = await configQuery.maybeSingle();

      if (!config) {
        errorMessage = "WhatsApp non configuré";
        logStatus = "failed";
      } else {
        const phone = normalizePhone(lead.phone);
        if (!phone) {
          errorMessage = "Téléphone du lead invalide";
          logStatus = "failed";
        } else {
          // 1. Upload média vers Meta (multipart/form-data)
          const form = new FormData();
          form.append("messaging_product", "whatsapp");
          form.append("type", metaMime);
          form.append(
            "file",
            new Blob([audioBytes], { type: metaMime }),
            `voice.${ext}`
          );
          const upRes = await fetch(`${GRAPH}/${config.phone_number_id}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.access_token}` },
            body: form,
          });
          const upJson = await upRes.json();
          console.log(`[send-whatsapp-audio] Meta upload (${upRes.status}):`, JSON.stringify(upJson));
          if (!upRes.ok || !upJson?.id) {
            errorMessage = `Upload média Meta échoué (${upRes.status}): ${JSON.stringify(upJson)}`;
            logStatus = "failed";
          } else {
            // 2. Envoyer message audio
            const sendRes = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: phone,
                type: "audio",
                audio: { id: upJson.id },
              }),
            });
            const sendJson = await sendRes.json();
            console.log(`[send-whatsapp-audio] Meta send (${sendRes.status}):`, JSON.stringify(sendJson));
            if (!sendRes.ok) {
              errorMessage = `Envoi Meta échoué (${sendRes.status}): ${JSON.stringify(sendJson)}`;
              logStatus = "failed";
            } else {
              waMessageId = sendJson.messages?.[0]?.id || null;
              logStatus = "sent";
            }
          }
        }
      }
    }

    await admin.from("whatsapp_messages").insert({
      lead_id,
      owner_id: user.id,
      direction: "outbound",
      content: "[Vocal]",
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
      media_type: metaMime,
      media_storage_path: storagePath,
    } as any);

    return new Response(
      JSON.stringify({
        success: logStatus !== "failed",
        dry_run: dryRun,
        status: logStatus,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-whatsapp-audio error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
