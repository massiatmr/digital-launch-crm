import { useLeads, useReminders, useToggleReminder } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Flame, Clock, AlertTriangle, Loader2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Dashboard() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: reminders = [] } = useReminders();
  const toggleReminder = useToggleReminder();

  const hotLeads = leads.filter(l => l.score === 'hot');
  const warmLeads = leads.filter(l => l.score === 'warm');
  const coldLeads = leads.filter(l => l.score === 'cold');
  const upcomingReminders = reminders.filter(r => !r.done).slice(0, 3);

  const stats = [
    { label: 'Total Leads', value: leads.length, icon: Users, color: 'text-foreground' },
    { label: 'Leads Chauds', value: hotLeads.length, icon: Flame, color: 'text-lead-hot' },
    { label: 'Leads Tièdes', value: warmLeads.length, icon: Clock, color: 'text-lead-warm' },
    { label: 'Leads Froids', value: coldLeads.length, icon: AlertTriangle, color: 'text-lead-cold' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-normal tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vue d'ensemble de votre pipeline</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className={`mt-2 text-3xl font-heading ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-heading text-lg">Leads récents</h2>
            <Link to="/leads" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {leads.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                Aucun lead. <Link to="/leads/new" className="text-primary hover:underline">Ajoutez votre premier lead</Link>
              </div>
            ) : (
              leads.slice(0, 5).map(lead => (
                <Link
                  key={lead.id}
                  to={`/leads/${lead.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{lead.name}</span>
                      <LeadScoreBadge score={lead.score} />
                      <LeadStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.message}</p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), 'dd MMM', { locale: fr })}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-heading text-lg">Prochaines actions</h2>
            <Link to="/reminders" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {upcomingReminders.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun rappel en attente</div>
            ) : (
              upcomingReminders.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                  <button
                    onClick={() => toggleReminder.mutate({ id: r.id, done: true })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors"
                  >
                    <Check className="h-3 w-3 text-transparent" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.leads?.name || 'Lead'}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.due_date), "dd MMM HH:mm", { locale: fr })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.action}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
