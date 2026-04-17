// Exécute une tâche de suivi : génère le message si besoin, le marque envoyé, log dans whatsapp_messages
// (Placeholder : pas d'envoi WhatsApp réel — sera branché à Meta Cloud API plus tard)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { task_id, custom_message } = await req.json();
    if (!task_id) return new Response(JSON.stringify({ error: "Missing task_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: task, error: taskErr } = await supabase
      .from("lead_followup_tasks").select("*").eq("id", task_id).maybeSingle();

    if (taskErr || !task) return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (task.status === 'sent' || task.status === 'cancelled') {
      return new Response(JSON.stringify({ error: `Task already ${task.status}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let messageContent = custom_message || task.message_content;
    let aiGenerated = false;

    if (!messageContent) {
      // Générer via IA
      const genResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-followup-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ lead_id: task.lead_id, task_type: task.task_type }),
      });
      if (!genResp.ok) {
        const errBody = await genResp.text();
        await supabase.from("lead_followup_tasks").update({ status: 'failed', error_message: errBody }).eq("id", task_id);
        return new Response(JSON.stringify({ error: "Failed to generate message", details: errBody }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const genData = await genResp.json();
      messageContent = genData.message;
      aiGenerated = true;
    }

    // TODO: brancher Meta Cloud API ici. Pour l'instant on log juste comme outbound.
    const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
      lead_id: task.lead_id,
      owner_id: user.id,
      direction: 'outbound',
      content: messageContent,
      task_id: task_id,
      status: 'logged_only',
    });
    if (msgErr) console.error("Insert wa_messages error:", msgErr);

    // Marquer la tâche comme envoyée
    await supabase.from("lead_followup_tasks").update({
      status: 'sent',
      executed_at: new Date().toISOString(),
      message_content: messageContent,
      ai_generated: aiGenerated,
    }).eq("id", task_id);

    return new Response(JSON.stringify({ success: true, message: messageContent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("execute-followup-task error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
