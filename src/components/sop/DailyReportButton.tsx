import { startOfDay, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/** Builds the end-of-day report from the user's own logged actions in the current workspace and copies it. */
export function DailyReportButton({ userId, workspaceId, leads, name, manager = false }: { userId: string; workspaceId: string | null; leads: any[]; name?: string; manager?: boolean }) {
  const run = async () => {
    const since = startOfDay(new Date()).toISOString();
    let q = supabase.from('lead_activities').select('activity_type,description').eq('owner_id', userId).gte('created_at', since);
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data = [] } = await q;
    const acts = data as any[];
    const calls = acts.filter(a => a.activity_type === 'call');
    const picked = calls.filter(a => /décroché/i.test(a.description || '')).length;
    const msgs = acts.filter(a => a.activity_type === 'whatsapp').length;
    const today = (d?: string) => d && d >= since;
    const newToday = leads.filter(l => today(l.created_at)).length;
    const waiting = leads.filter(l => l.status === 'new' && !l.first_contacted_at).length;
    const { count: rdv } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .in('lead_id', leads.map(l => l.id).slice(0, 500)).gte('created_at', since);
    const txt = `Rapport du ${format(new Date(), 'EEEE d MMMM', { locale: fr })}${name ? ` — ${name}` : ''}
• Nouveaux leads : ${newToday}
• Appels passés : ${calls.length} (${picked} décrochés)
• Messages envoyés : ${msgs}
• RDV bookés : ${rdv ?? 0}
• Leads encore à appeler : ${waiting}
• Blocages / questions : `;
    await navigator.clipboard.writeText(txt);
    toast.success('Rapport copié, colle-le dans WhatsApp');
  };
  const sendEmail = async () => {
    if (!workspaceId) return toast.error('Choisis un espace de travail');
    const t = toast.loading('Envoi du rapport…');
    const { data, error } = await supabase.functions.invoke('daily-report-email', { body: { workspace_id: workspaceId } });
    toast.dismiss(t);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || "Envoi impossible");
    toast.success(`Rapport envoyé à ${(data as any).to}`);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {!manager && <Button size="sm" variant="outline" onClick={run}><FileText className="mr-1 h-4 w-4" />Copier le rapport</Button>}
      <Button size="sm" variant="outline" onClick={sendEmail}><Mail className="mr-1 h-4 w-4" />Recevoir le rapport par email</Button>
    </div>
  );
}
