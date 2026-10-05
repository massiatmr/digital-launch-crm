// Bascule automatique vers le "Work Phone" (formulaire Meta, stocké dans les notes)
// quand un envoi WhatsApp échoue sur le numéro principal. Une seule bascule par lead.

const WORK_LABEL = /(work[\s_-]*phone(?:[\s_-]*number)?|t[ée]l[ée]phone\s*(?:pro(?:fessionnel)?|de\s*travail|travail)|num[ée]ro\s*(?:pro(?:fessionnel)?|de\s*travail))/i;

export function extractWorkPhone(notes: string | null | undefined): string | null {
  if (!notes) return null;
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.replace(/^[\s•\-*]+/, "");
    const m = line.match(/^([^:]{1,60})\s*:\s*(.+)$/);
    if (!m || !WORK_LABEL.test(m[1])) continue;
    const val = m[2].trim();
    const digits = val.replace(/\D/g, "");
    if (digits.length < 8) continue;
    return val.trim().startsWith("+") || val.startsWith("00") ? `+${digits.replace(/^00/, "")}` : digits;
  }
  return null;
}

const sameNumber = (a: string, b: string) => {
  const da = a.replace(/\D/g, "").replace(/^00/, ""), db = b.replace(/\D/g, "").replace(/^00/, "");
  const tail = (s: string) => s.slice(-9);
  return da === db || (da.length >= 9 && db.length >= 9 && tail(da) === tail(db));
};

/** Tente de passer le lead sur son Work Phone. Retourne le nouveau numéro ou null. */
export async function trySwitchToWorkPhone(admin: any, leadId: string, reason: string): Promise<string | null> {
  if (!leadId) return null;
  const { data: lead } = await admin.from("leads").select("id, phone, notes, metadata, owner_id, workspace_id").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const meta = (lead.metadata && typeof lead.metadata === "object") ? lead.metadata : {};
  if (meta.work_phone_fallback_used) return null;
  const work = extractWorkPhone(lead.notes);
  if (!work || (lead.phone && sameNumber(lead.phone, work))) return null;

  await admin.from("leads").update({
    phone: work,
    metadata: { ...meta, work_phone_fallback_used: true, phone_original: lead.phone, work_phone_switched_at: new Date().toISOString() },
  } as any).eq("id", leadId);

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    owner_id: lead.owner_id,
    workspace_id: lead.workspace_id ?? null,
    activity_type: "note",
    content: `📞 Échec WhatsApp sur ${lead.phone ?? "—"} → bascule automatique sur le numéro de travail ${work}. (${reason.slice(0, 160)})`,
  } as any).then(() => {}, (e: any) => console.error("work phone activity log failed", e));

  console.log("work_phone_fallback", { lead_id: leadId, switched: true });
  return work;
}

/** Recrée une tâche identique (pending, maintenant) pour renvoyer sur le nouveau numéro. */
export async function requeueTask(admin: any, taskId: string): Promise<boolean> {
  const { data: t } = await admin.from("lead_followup_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!t) return false;
  const { id: _id, created_at: _c, updated_at: _u, executed_at: _e, error_message: _m, message_content: _mc, ...rest } = t;
  const { error } = await admin.from("lead_followup_tasks").insert({
    ...rest,
    status: "pending",
    scheduled_at: new Date().toISOString(),
    error_message: "Renvoi automatique sur le numéro de travail",
  } as any);
  if (error) { console.error("requeue task failed", error); return false; }
  return true;
}
