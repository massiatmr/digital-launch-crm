// Aperçu d'audience pour une campagne WhatsApp : compte les destinataires éligibles et renvoie un échantillon.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Filter = {
  workspace_id: string | null;
  entity?: "leads" | "clients" | "both";
  lead_statuses?: string[];
  scores?: string[];
  sources?: string[];
  offer_ids?: string[];
  conversation_states?: string[];
  client_statuses?: string[];
  no_reply_days?: number | null;
  never_contacted?: boolean;
  exclude_paused?: boolean;
  exclude_resolved?: boolean;
  exclude_pending_followups?: boolean;
};

function buildLeadsQuery(supabase: any, f: Filter) {
  let q = supabase
    .from("leads")
    .select("id, name, phone, email, status, score, source, offer_id, last_contacted_at, workspace_id", { count: "exact" })
    .is("deleted_at", null)
    .not("phone", "is", null)
    .neq("phone", "");
  if (f.workspace_id) q = q.eq("workspace_id", f.workspace_id);
  if (f.lead_statuses?.length) q = q.in("status", f.lead_statuses);
  if (f.scores?.length) q = q.in("score", f.scores);
  if (f.sources?.length) q = q.in("source", f.sources);
  if (f.offer_ids?.length) q = q.in("offer_id", f.offer_ids);
  if (f.never_contacted) q = q.is("last_contacted_at", null);
  if (f.no_reply_days && f.no_reply_days > 0) {
    const cutoff = new Date(Date.now() - f.no_reply_days * 86400000).toISOString();
    q = q.lt("last_contacted_at", cutoff);
  }
  return q;
}

function buildClientsQuery(supabase: any, f: Filter) {
  let q = supabase
    .from("clients")
    .select("id, name, phone, email, status, workspace_id", { count: "exact" })
    .is("deleted_at", null)
    .not("phone", "is", null)
    .neq("phone", "");
  if (f.workspace_id) q = q.eq("workspace_id", f.workspace_id);
  if (f.client_statuses?.length) q = q.in("status", f.client_statuses);
  return q;
}

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

    const f = (await req.json()) as Filter;
    const entity = f.entity || "leads";
    const sample: any[] = [];
    let total = 0;

    if (entity === "leads" || entity === "both") {
      const { data, count, error } = await buildLeadsQuery(supabase, f).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      total += count || 0;
      for (const l of data || []) sample.push({ kind: "lead", id: l.id, name: l.name, phone: l.phone, email: l.email, meta: { status: l.status, score: l.score, source: l.source } });
    }
    if (entity === "clients" || entity === "both") {
      const { data, count, error } = await buildClientsQuery(supabase, f).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      total += count || 0;
      for (const c of data || []) sample.push({ kind: "client", id: c.id, name: c.name, phone: c.phone, email: c.email, meta: { status: c.status } });
    }

    return new Response(JSON.stringify({ total, sample: sample.slice(0, 50) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("campaigns-preview-audience error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
