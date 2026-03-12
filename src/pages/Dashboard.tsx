import { mockLeads, mockReminders } from '@/data/mockData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Flame, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Dashboard() {
  const hotLeads = mockLeads.filter(l => l.score === 'hot');
  const warmLeads = mockLeads.filter(l => l.score === 'warm');
  const coldLeads = mockLeads.filter(l => l.score === 'cold');
  const upcomingReminders = mockReminders.filter(r => !r.done).slice(0, 3);

  const stats = [
    { label: 'Total Leads', value: mockLeads.length, icon: Users, color: 'text-foreground' },
    { label: 'Leads Chauds', value: hotLeads.length, icon: Flame, color: 'text-lead-hot' },
    { label: 'Leads Tièdes', value: warmLeads.length, icon: Clock, color: 'text-lead-warm' },
    { label: 'Leads Froids', value: coldLeads.length, icon: AlertTriangle, color: 'text-lead-cold' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-normal tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vue d'ensemble de votre pipeline</p>
      </div>

      {/* Stats */}
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
        {/* Recent Leads */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-heading text-lg">Leads récents</h2>
            <Link to="/leads" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {mockLeads.slice(0, 5).map(lead => (
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
                  {format(new Date(lead.createdAt), 'dd MMM', { locale: fr })}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Upcoming Reminders */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-heading text-lg">Prochaines actions</h2>
            <Link to="/reminders" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {upcomingReminders.map(r => (
              <div key={r.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.leadName}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.dueDate), "dd MMM HH:mm", { locale: fr })}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
