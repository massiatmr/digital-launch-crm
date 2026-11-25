// Evening digest: per-member KPIs for the day, emailed via workspace SMTP (global fallback).
// Cron (service role) => every workspace; owners get all members, members get their own section.
// Authenticated user + workspace_id => sends the report now to that user only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { isServiceRoleRequest, escapeHtml } from "../_shared/internalAuth.ts";
import { computeStats, hasActivity, parisStamp, type Stats } from "../_shared/dailyReport.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://digital-launch-crm.lovable.app";

type Person = { id: string; email: string; name: string; manager: boolean };

function pct(v: number | null) { return v === null ? "—" : `${v}%`; }
function ratio(a: number, b: number) { return b ? `${a}/${b}` : "—"; }

function section(title: string | null, s: Stats) {
  const row = (l: string, v: string, hint = "") => `<tr><td style="padding:6px 0;color:#4b5563;font-size:14px">${l}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;font-size:14px">${v}${hint ? `<span style="color:#9ca3af;font-weight:400"> ${hint}</span>` : ""}</td></tr>`;
  const head = (t: string) => `<tr><td colspan="2" style="padding:14px 0 4px;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#7C3AED">${t}</td></tr>`;
  return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:16px 0">
  ${title ? `<div style="font-size:17px;font-weight:700;color:#111827">${escapeHtml(title)}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0">
  ${head("Appels")}
  ${row("Tentatives d'appel", String(s.callAttempts))}
  ${row("Appels décrochés", String(s.callsAnswered))}
  ${row("Taux de réponse", pct(s.answerRate))}
  ${head("Rendez-vous")}
  ${row("RDV pris aujourd'hui", String(s.bookingsTaken))}
  ${row("RDV prévus aujourd'hui", String(s.meetingsToday))}
  ${row("Honorés / absents", `${s.meetingsShow} / ${s.meetingsNoShow}`, s.meetingsCancelled ? `(${s.meetingsCancelled} annulé${s.meetingsCancelled > 1 ? "s" : ""})` : "")}
  ${row("Taux de présence", pct(s.showRate))}
  ${head("Suivi")}
  ${row("Confirmations envoyées à temps", ratio(s.confirmationsOnTime, s.confirmationsDue), "(< 1h après le RDV pris)")}
  ${row("Rappels du matin à temps", ratio(s.remindersOnTime, s.remindersDue), "(avant l'heure du RDV)")}
  ${row("Relances prévues faites", ratio(s.followupsDone, s.followupsDue))}
  ${row("Messages de relance envoyés", String(s.followupMessages))}
  ${head("Business")}
  ${row("Clients signés", String(s.signed))}
  </table></div>`;
}

function sum(list: Stats[]): Stats {
  const t = Object.fromEntries(Object.keys(list[0]).map((k) => [k, list.reduce((a, s) => a + ((s as any)[k] ?? 0), 0)])) as any as Stats;
  const r = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  t.answerRate = r(t.callsAnswered, t.callAttempts);
  t.showRate = r(t.meetingsShow, t.meetingsShow + t.meetingsNoShow);
  return t;
}

async function buildWorkspace(db: any, ws: any, day: string) {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const [{ data: members }, { data: acts }, { data: bookings }, { data: rems }, { data: clients }] = await Promise.all([
    db.from("workspace_members").select("user_id, role").eq("workspace_id", ws.id),
    db.from("lead_activities").select("owner_id, lead_id, activity_type, description, created_at").eq("workspace_id", ws.id).gte("created_at", since).limit(10000),
    db.from("bookings").select("id, lead_id, owner_id, booking_date, time_slot, status, created_at").eq("workspace_id", ws.id).is("deleted_at", null).or(`booking_date.eq.${day},created_at.gte.${since}`).limit(5000),
    db.from("reminders").select("owner_id, due_date, done").eq("workspace_id", ws.id).gte("due_date", since).limit(5000),
    db.from("clients").select("owner_id, created_at").eq("workspace_id", ws.id).is("deleted_at", null).gte("created_at", since),
  ]);
  const leadIds = [...new Set((bookings || []).map((b: any) => b.lead_id).filter(Boolean))];
  const { data: leads } = leadIds.length ? await db.from("leads").select("id, assigned_to, show_status").in("id", leadIds) : { data: [] };
  const leadMap = new Map((leads || []).map((l: any) => [l.id, l]));
  const showByLead: Record<string, string> = {};
  for (const l of leads || []) showByLead[(l as any).id] = (l as any).show_status;

  const people = new Map<string, Person>();
  const addPerson = async (id: string, manager: boolean) => {
    if (!id || people.has(id)) { if (manager && people.has(id)) people.get(id)!.manager = true; return; }
    const { data } = await db.auth.admin.getUserById(id);
    const u = data?.user; if (!u?.email) return;
    people.set(id, { id, email: u.email, name: (u.user_metadata as any)?.sop_name || (u.user_metadata as any)?.full_name || u.email.split("@")[0], manager });
  };
  if (ws.created_by) await addPerson(ws.created_by, true);
  for (const m of members || []) await addPerson((m as any).user_id, (m as any).role === "owner");

  const bk = (bookings || []).map((b: any) => ({ ...b, rep: (leadMap.get(b.lead_id) as any)?.assigned_to || b.owner_id }));
  const stats = new Map<string, Stats>();
  for (const p of people.values()) {
    const s = computeStats(day,
      (acts || []).filter((a: any) => a.owner_id === p.id),
      bk.filter((b: any) => b.rep === p.id),
      (rems || []).filter((r: any) => r.owner_id === p.id),
      (clients || []).filter((c: any) => c.owner_id === p.id && parisStamp(c.created_at).startsWith(day)).length,
      showByLead);
    stats.set(p.id, s);
  }
  return { people: [...people.values()], stats };
}

function render(ws: any, day: string, viewer: Person, people: Person[], stats: Map<string, Stats>) {
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  let body: string;
  if (viewer.manager) {
    const active = people.filter((p) => hasActivity(stats.get(p.id)!));
    const shown = active.length ? active : people.filter((p) => p.id === viewer.id);
    if (shown.length <= 1) body = section(null, stats.get(shown[0]?.id ?? viewer.id)!);
    else body = section("Total équipe", sum(shown.map((p) => stats.get(p.id)!))) + shown.map((p) => section(p.name, stats.get(p.id)!)).join("");
  } else body = section(null, stats.get(viewer.id)!);
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="font-size:13px;color:#6b7280">${escapeHtml(ws.company_name || "CRM")}</div>
  <h1 style="margin:4px 0 0;font-size:22px;color:#111827">Rapport du ${escapeHtml(label)}</h1>
  <p style="margin:6px 0 0;color:#6b7280;font-size:14px">${viewer.manager ? "Bilan de la journée par membre." : `Ton bilan de la journée, ${escapeHtml(viewer.name)}.`}</p>
  ${body}
  <a href="${APP}/dashboard" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Ouvrir le dashboard</a>
  </div></body></html>`;
  return { subject: `Rapport du ${label} — ${ws.company_name || "CRM"}`, html };
}

async function send(to: string, subject: string, html: string, workspaceId: string) {
  const r = await fetch(`${URL_}/functions/v1/send-smtp-email`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html, workspaceId }) });
  const ok = r.ok; await r.body?.cancel(); return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(URL_, SRK);
  const body = await req.json().catch(() => ({}));
  const day = parisStamp(new Date().toISOString()).slice(0, 10);

  if (await isServiceRoleRequest(req)) {
    const hour = Number(parisStamp(new Date().toISOString()).slice(11, 13));
    if (!body.force && hour !== 20) return json({ skipped: "not 20h Paris", hour });
    const { data: wss } = await db.from("workspaces").select("id, company_name, created_by").is("deleted_at", null);
    let sent = 0;
    for (const ws of wss || []) {
      try {
        const { people, stats } = await buildWorkspace(db, ws, day);
        if (!people.some((p) => hasActivity(stats.get(p.id)!))) continue; // quiet day: no email
        for (const p of people) {
          if (!p.manager && !hasActivity(stats.get(p.id)!)) continue;
          const { subject, html } = render(ws, day, p, people, stats);
          if (await send(p.email, subject, html, ws.id)) sent++;
        }
      } catch (e) { console.error("workspace report failed", ws.id, e); }
    }
    return json({ ok: true, sent });
  }

  // Manual send by a signed-in user
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const wsId = typeof body.workspace_id === "string" ? body.workspace_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(wsId)) return json({ error: "workspace_id requis" }, 400);
  const { data: ws } = await db.from("workspaces").select("id, company_name, created_by").eq("id", wsId).maybeSingle();
  if (!ws) return json({ error: "Espace introuvable" }, 404);
  const { people, stats } = await buildWorkspace(db, ws, day);
  const me = people.find((p) => p.id === u.user.id);
  if (!me) return json({ error: "Accès refusé" }, 403);
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: me.id, _role: "admin" });
  if (isAdmin) me.manager = true;
  const { subject, html } = render(ws, day, me, people, stats);
  const ok = await send(me.email, subject, html, ws.id);
  return ok ? json({ ok: true, to: me.email }) : json({ error: "Envoi impossible, vérifie le SMTP" }, 502);
});
