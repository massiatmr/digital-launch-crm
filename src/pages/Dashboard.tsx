import { useLeads, useReminders, useToggleReminder } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Flame, Clock, AlertTriangle, Loader2, Check, TrendingUp, Target, BarChart3 } from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: reminders = [] } = useReminders();
  const toggleReminder = useToggleReminder();

  const hotLeads = leads.filter(l => l.score === 'hot');
  const warmLeads = leads.filter(l => l.score === 'warm');
  const coldLeads = leads.filter(l => l.score === 'cold');
  const upcomingReminders = reminders.filter(r => !r.done).slice(0, 3);

  // Stats
  const wonLeads = leads.filter(l => l.status === 'won');
  const lostLeads = leads.filter(l => l.status === 'lost');
  const closingRate = leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0;

  // Pipeline distribution for pie chart
  const statusLabels: Record<string, string> = {
    new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
    proposal: 'Proposition', ghost: 'À Relancer', won: 'Gagné', lost: 'Perdu',
  };
  const pipelineData = Object.entries(
    leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: statusLabels[status] || status, value: count }));
  const PIE_COLORS = ['hsl(215,70%,55%)', 'hsl(35,92%,55%)', 'hsl(210,70%,50%)', 'hsl(280,60%,55%)', 'hsl(35,92%,55%)', 'hsl(140,60%,45%)', 'hsl(0,72%,55%)'];

  // Leads over time (last 30 days)
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const day = subDays(new Date(), 29 - i);
    const dayStr = format(day, 'dd/MM');
    const count = leads.filter(l => format(new Date(l.created_at), 'dd/MM') === dayStr).length;
    return { date: dayStr, leads: count };
  }).filter(d => d.leads > 0 || true);
  // Only show last 14 days for cleaner chart
  const chartData = last30.slice(-14);

  // Score distribution bar chart
  const scoreData = [
    { name: '🔥 Chauds', count: hotLeads.length, fill: 'hsl(0,72%,55%)' },
    { name: '🌤 Tièdes', count: warmLeads.length, fill: 'hsl(35,92%,55%)' },
    { name: '❄️ Froids', count: coldLeads.length, fill: 'hsl(215,70%,55%)' },
  ];

  const stats = [
    { label: 'Total Leads', value: leads.length, icon: Users, color: 'text-foreground' },
    { label: 'Leads Chauds', value: hotLeads.length, icon: Flame, color: 'text-lead-hot' },
    { label: 'Taux de Closing', value: `${closingRate}%`, icon: Target, color: 'text-primary' },
    { label: 'Gagnés / Perdus', value: `${wonLeads.length}/${lostLeads.length}`, icon: TrendingUp, color: 'text-primary' },
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className={`mt-2 text-2xl sm:text-3xl font-heading ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads over time */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-lg mb-4">Leads dans le temps</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,18%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215,15%,55%)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(215,15%,55%)' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,18%)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(210,20%,92%)' }}
                />
                <Line type="monotone" dataKey="leads" stroke="hsl(210,70%,50%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline distribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-lg mb-4">Répartition pipeline</h2>
          <div className="h-48 flex items-center justify-center">
            {pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {pipelineData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,18%)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun lead</p>
            )}
          </div>
        </div>
      </div>

      {/* Score distribution + conversion bar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-heading text-lg mb-4">Score des leads</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreData}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215,15%,55%)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(215,15%,55%)' }} />
                <Tooltip contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,18%)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent leads */}
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
                      {lead.company_name && <span className="text-xs text-muted-foreground">· {lead.company_name}</span>}
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
      </div>

      {/* Reminders */}
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
  );
}
