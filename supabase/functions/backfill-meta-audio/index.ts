// Récupère les vocaux Messenger/Instagram enregistrés en "[audio]" sans fichier,
// les télécharge depuis Graph API, les stocke et les transcrit. Réservé aux utilisateurs connectés
// (limité aux workspaces dont ils sont membres).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: wsIds } = await admin.rpc("user_workspace_ids", { _user_id: u.user.id });
  const ids = (wsIds ?? []).map((r: any) => r.user_workspace_ids ?? r);
  if (!ids.length) return json({ processed: 0 });

  const { data: msgs } = await admin.from("whatsapp_messages")
    .select("id, wa_message_id, workspace_id, owner_id, direction")
    .in("workspace_id", ids).in("channel", ["messenger", "instagram"])
    .in("content", ["[audio]", "[image]", "[video]", "[file]"]).is("media_storage_path", null)
    .not("wa_message_id", "is", null).limit(100);

  const key = Deno.env.get("LOVABLE_API_KEY");
  let processed = 0, failed = 0;
  for (const m of msgs ?? []) {
    try {
      const { data: idents } = await admin.from("meta_channel_identities")
        .select("page_access_token, instagram_access_token").eq("workspace_id", m.workspace_id);
      let att: any = null;
      for (const i of idents ?? []) {
        for (const tok of [i.page_access_token, i.instagram_access_token].filter(Boolean)) {
          const r = await fetch(`https://graph.facebook.com/v21.0/${m.wa_message_id}?fields=attachments&access_token=${tok}`);
          const j = await r.json();
          att = j?.attachments?.data?.[0];
          if (att) break;
        }
        if (att) break;
      }
      const fileUrl = att?.file_url || att?.image_data?.url || att?.video_data?.url;
      if (!fileUrl) { failed++; continue; }
      const bin = await fetch(fileUrl);
      if (!bin.ok) { failed++; continue; }
      const buf = new Uint8Array(await bin.arrayBuffer());
      const name: string = att.name || "";
      let mime: string = att.mime_type || bin.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      const isAudio = mime.startsWith("audio") || name.startsWith("audioclip");
      if (isAudio && !mime.startsWith("audio")) mime = "audio/mp4";
      const ext = name.split(".").pop() || mime.split("/")[1] || "bin";
      const bucket = isAudio ? "wa-audio" : "wa-media";
      const path = isAudio ? `inbound/${m.owner_id}/${m.id}.${ext}` : `${m.owner_id}/inbound-${m.id}.${ext}`;
      const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, { contentType: mime, upsert: true });
      if (upErr) { failed++; continue; }
      const update: any = { media_storage_path: path, media_type: mime, media_size_bytes: buf.byteLength, message_type: isAudio ? "audio" : "image" };
      if (isAudio) {
        update.content = "[Vocal]";
        if (key) {
          const fd = new FormData();
          fd.append("model", "openai/gpt-transcribe");
          fd.append("file", new Blob([buf], { type: mime }), `voice.${ext}`);
          const tr = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
          if (tr.ok) { const t = String((await tr.json())?.text ?? "").trim(); if (t) { update.transcript = t; update.content = t; } }
          else console.error("transcription failed", tr.status, (await tr.text()).slice(0, 200));
        }
      }
      await admin.from("whatsapp_messages").update(update).eq("id", m.id);
      processed++;
    } catch (e) { console.error("backfill error", String(e)); failed++; }
  }
  return json({ processed, failed, total: msgs?.length ?? 0 });
});
