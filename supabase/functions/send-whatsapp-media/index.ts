// Envoie un média (image, vidéo, document) WhatsApp à un lead.
// Le client envoie : { lead_id, media_base64, mime_type, filename, caption?, reply_to_wa_id? }
// On stocke d'abord dans le bucket privé wa-media, puis on upload sur Meta et on envoie le message.
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

function detectKind(mime: string): "image" | "video" | "document" | "audio" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function extFromMime(mime: string, fallback = "bin"): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "application/pdf": "pdf", "application/zip": "zip",
    "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav",
  };
  return map[mime] || fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { lead_id, media_base64, mime_type, filename, caption, reply_to_wa_id } = await req.json();
    if (!lead_id || !media_base64 || !mime_type) {
      return new Response(JSON.stringify({ error: "Missing lead_id, media_base64 or mime_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Decode base64 → bytes
    const binary = atob(media_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const kind = detectKind(mime_type);
    const ext = extFromMime(mime_type);
    const safeFilename = (filename || `media-${Date.now()}.${ext}`).replace(/[^\w.\-]/g, "_");
    const storagePath = `${user.id}/${Date.now()}-${safeFilename}`;

    // Upload local d'abord (pour preview même si Meta échoue)
    const { error: upErr } = await admin.storage.from("wa-media").upload(storagePath, bytes, { contentType: mime_type, upsert: false });
    if (upErr) {
      console.error("wa-media upload error:", upErr);
    }

    const { data: settings } = await admin.from("followup_automation_settings").select("dry_run").eq("owner_id", user.id).maybeSingle();
    const dryRun = settings?.dry_run !== false;

    let waMessageId: string | null = null;
    let errorMessage: string | null = null;
    let logStatus = dryRun ? "dry_run" : "sent";

    if (!dryRun) {
      let configQuery = admin.from("whatsapp_config").select("*").eq("is_active", true);
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
          // 1) Upload média vers Meta
          const formData = new FormData();
          formData.append("messaging_product", "whatsapp");
          formData.append("type", mime_type);
          formData.append("file", new Blob([bytes], { type: mime_type }), safeFilename);
          const upRes = await fetch(`${GRAPH}/${config.phone_number_id}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.access_token}` },
            body: formData,
          });
          const upJson = await upRes.json();
          if (!upRes.ok || !upJson.id) {
            errorMessage = `Upload média Meta échoué: ${JSON.stringify(upJson)}`;
            logStatus = "failed";
          } else {
            const mediaId = upJson.id;
            // 2) Envoi message
            const payload: any = {
              messaging_product: "whatsapp",
              to: phone,
              type: kind,
              [kind]: { id: mediaId },
            };
            if (caption && (kind === "image" || kind === "video" || kind === "document")) {
              payload[kind].caption = caption;
            }
            if (kind === "document") {
              payload[kind].filename = safeFilename;
            }
            if (reply_to_wa_id) payload.context = { message_id: reply_to_wa_id };

            const sendRes = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const sendJson = await sendRes.json();
            if (!sendRes.ok) { errorMessage = JSON.stringify(sendJson); logStatus = "failed"; }
            else { waMessageId = sendJson.messages?.[0]?.id || null; logStatus = "sent"; }
          }
        }
      }
    }

    // Snapshot reply
    let replySnapshot: any = null;
    if (reply_to_wa_id) {
      const { data: orig } = await admin.from("whatsapp_messages")
        .select("id, content, direction, message_type")
        .eq("wa_message_id", reply_to_wa_id).maybeSingle();
      if (orig) {
        replySnapshot = {
          wa_id: reply_to_wa_id,
          direction: (orig as any).direction,
          excerpt: ((orig as any).content || "").slice(0, 120),
          type: (orig as any).message_type,
        };
      }
    }

    await admin.from("whatsapp_messages").insert({
      lead_id,
      owner_id: user.id,
      workspace_id: lead.workspace_id ?? null,
      direction: "outbound",
      content: caption || (kind === "image" ? "[Photo]" : kind === "video" ? "[Vidéo]" : kind === "audio" ? "[Vocal]" : "[Document]"),
      status: logStatus,
      wa_message_id: waMessageId,
      error_message: errorMessage,
      message_type: kind,
      media_type: mime_type,
      media_storage_path: storagePath,
      media_filename: safeFilename,
      media_size_bytes: bytes.byteLength,
      reply_to_wa_id: reply_to_wa_id ?? null,
      reply_to_snapshot: replySnapshot,
    } as any);

    return new Response(JSON.stringify({ success: logStatus !== "failed", dry_run: dryRun, status: logStatus, error: errorMessage, storage_path: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-whatsapp-media error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
