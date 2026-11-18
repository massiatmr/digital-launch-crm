// Transcrit + résume un enregistrement d'appel ; nettoie aussi les audios expirés.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const GW = "https://ai.gateway.lovable.dev/v1";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({ recording_id: z.string().uuid() });

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resume", "besoin", "objections", "prochaine_etape", "score"],
  properties: {
    resume: { type: "string" },
    besoin: { type: "string" },
    objections: { type: "array", items: { type: "string" } },
    prochaine_etape: { type: "string" },
    score: { type: "string", enum: ["hot", "warm", "cold"] },
  },
};

async function cleanupExpired(admin: any) {
  const { data } = await admin.from("call_recordings").select("id, storage_path")
    .not("storage_path", "is", null).lt("audio_expires_at", new Date().toISOString()).limit(100);
  if (!data?.length) return;
  await admin.storage.from("call-recordings").remove(data.map((r: any) => r.storage_path));
  await admin.from("call_recordings").update({ storage_path: null, size_bytes: 0 }).in("id", data.map((r: any) => r.id));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Non connecté" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "recording_id invalide" }, 400);

  // Lecture via RLS : l'utilisateur doit voir le lead
  const { data: rec } = await userClient.from("call_recordings").select("*").eq("id", parsed.data.recording_id).maybeSingle();
  if (!rec) return json({ error: "Enregistrement introuvable" }, 404);
  if (!rec.storage_path) return json({ error: "Audio supprimé" }, 410);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "IA non configurée" }, 500);
  await admin.from("call_recordings").update({ status: "transcribing", error: null }).eq("id", rec.id);

  try {
    const { data: blob, error: dlErr } = await admin.storage.from("call-recordings").download(rec.storage_path);
    if (dlErr || !blob) throw new Error("Téléchargement audio impossible");

    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", new File([blob], "call.webm", { type: "audio/webm" }));
    form.append("response_format", "json");
    if (rec.language === "fr") {
      form.append("languages", "fr");
      form.append("prompt", "Appel commercial en français entre un conseiller et un prospect.");
    } else {
      form.append("languages", "ar");
      form.append("languages", "fr");
      form.append("prompt", "Appel commercial en darija algérienne/maghrébine, mélange d'arabe et de français. Transcris fidèlement chaque langue telle qu'elle est parlée.");
    }
    const tr = await fetch(`${GW}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (!tr.ok) {
      const t = await tr.text();
      console.error("transcription", tr.status, t.slice(0, 300));
      throw new Error(tr.status === 402 ? "Crédits IA épuisés" : tr.status === 429 ? "Trop de demandes, réessaie dans un instant" : "Transcription impossible");
    }
    const transcript: string = ((await tr.json()).text ?? "").trim();
    if (!transcript) throw new Error("Aucune voix détectée");

    let summary: any = null;
    const sr = await fetch(`${GW}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        instructions: "Tu analyses la transcription d'un appel commercial (setter ↔ prospect). Réponds en français, phrases courtes. score: hot = prêt à avancer, warm = intéressé, cold = pas intéressé.",
        input: transcript.slice(0, 60000),
        text: { format: { type: "json_schema", name: "call_summary", strict: true, schema: SUMMARY_SCHEMA } },
      }),
    });
    if (sr.ok) {
      const d = await sr.json();
      const txt = d.output_text ?? d.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
      try { summary = JSON.parse(txt); } catch { /* ignore */ }
    } else console.error("summary", sr.status);

    await admin.from("call_recordings").update({ transcript, summary, status: "done" }).eq("id", rec.id);
    if (rec.activity_id && summary?.resume) {
      await admin.from("lead_activities").update({ description: `📞 Appel enregistré — ${summary.resume}` }).eq("id", rec.activity_id);
    }
    await cleanupExpired(admin).catch((e) => console.error("cleanup", e));
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    await admin.from("call_recordings").update({ status: "failed", error: msg }).eq("id", rec.id);
    return json({ error: msg }, 500);
  }
});
