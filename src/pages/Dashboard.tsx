import { useLeads, useReminders, useToggleReminder } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Flame, Clock, Loader2, Check, TrendingUp, Target, BarChart3, AlertTriangle, CalendarCheck, ListChecks, UserCheck, Zap, RefreshCw } from 'lucide-react';
import { format, subDays, differenceInHours } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { useIsMobile } from '@/hooks/use-mobile';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};

function KpiCard({ label, value, suffix, subtitle, subtitleColor, icon: Icon, gradient, iconColor }: {
  label: string; value: number; suffix?: string; subtitle?: string; subtitleColor?: string;
  icon: React.ElementType; gradient: string; iconColor: string;
}) {
  return (
    <div className="glass-card p-4 sm:p-5 group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <div className={`stat-icon-glow bg-gradient-to-br ${gradient}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </div>
      <p className="mt-2 sm:mt-3 text-xl sm:text-3xl font-semibold font-mono tracking-tight text-foreground">
        <CountUp end={value} duration={1.5} />{suffix}
      </p>
      {subtitle && (
        <p className={`mt-1 text-[10px] sm:text-xs ${subtitleColor || 'text-muted-foreground'}`}>{subtitle}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: reminders = [] } = useReminders();
  const toggleReminder = useToggleReminder();
  const isMobile = useIsMobile();

  // — KPI 1: New leads last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30);
  const newLeads30d = leads.filter(l => new Date(l.created_at) >= thirtyDaysAgo);
  const newLeads30dAlert = newLeads30d.length < 5;

  // — KPI 2: Avg time New → Contacted (hours)
  const contactedLeads = leads.filter(l => l.last_contacted_at && l.status !== 'new');
  const avgResponseHours = contactedLeads.length > 0
    ? Math.round(contactedLeads.reduce((sum, l) => sum + differenceInHours(new Date(l.last_contacted_at!), new Date(l.created_at)), 0) / contactedLeads.length)
    : -1;
  const hasResponseData = avgResponseHours >= 0;

  // — KPI 3: Show-up rate
  const leadsWithShowStatus = leads.filter(l => l.show_status && l.show_status !== 'pending');
  const showLeads = leads.filter(l => l.show_status === 'show');
  const showRate = leadsWithShowStatus.length > 0
    ? Math.round((showLeads.length / leadsWithShowStatus.length) * 100)
    : 0;

  // — KPI 4: Pending tasks
  const pendingReminders = reminders.filter(r => !r.done);
  const overdueReminders = pendingReminders.filter(r => new Date(r.due_date) < new Date());

  // — KPI 5: Closing rate (won vs leads that reached proposal stage, including lost that passed through proposal)
  const wonLeads = leads.filter(l => l.status === 'won');
  const proposalOrWonLeads = leads.filter(l => ['proposal', 'won'].includes(l.status));
  // Lost leads that previously went through proposal are counted in the denominator
  const lostFromProposal = leads.filter(l => l.status === 'lost' && l.show_status !== 'pending');
  const closingDenominator = proposalOrWonLeads.length + lostFromProposal.length;
  const closingRate = closingDenominator > 0 ? Math.round((wonLeads.length / closingDenominator) * 100) : 0;

  // — KPI 6: Qualification rate (intéressés vs perdus)
  const interestedLeads = leads.filter(l => ['qualified', 'proposal', 'won'].includes(l.status));
  const interestedAndLost = leads.filter(l => ['qualified', 'proposal', 'won', 'lost'].includes(l.status));
  const qualificationRate = interestedAndLost.length > 0 ? Math.round((interestedLeads.length / interestedAndLost.length) * 100) : 0;

  // — KPI 7: Pipeline value (leads in proposal)
  const pipelineValue = leads.filter(l => l.status === 'proposal').length;

  // — KPI 8: Leads to relaunch
  const sevenDaysAgo = subDays(new Date(), 7);
  const leadsToRelaunch = leads.filter(l => {
    if (l.status === 'ghost') return true;
    if (['won', 'lost'].includes(l.status)) return false;
    const lastContact = l.last_contacted_at ? new Date(l.last_contacted_at) : new Date(l.created_at);
    return lastContact < sevenDaysAgo;
  });

  // Charts
  const statusLabels: Record<string, string> = {
    new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
    proposal: 'Proposition', ghost: 'À Relancer', won: 'Gagné', lost: 'Perdu',
  };
  const pipelineData = Object.entries(
    leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: statusLabels[status] || status, value: count }));
  const PIE_COLORS = ['hsl(220,80%,56%)', 'hsl(35,92%,55%)', 'hsl(250,70%,60%)', 'hsl(280,60%,55%)', 'hsl(35,80%,50%)', 'hsl(140,60%,45%)', 'hsl(0,72%,55%)'];

  const last30 = Array.from({ length: 30 }, (_, i) => {
    const day = subDays(new Date(), 29 - i);
    const dayStr = format(day, 'dd/MM');
    const count = leads.filter(l => format(new Date(l.created_at), 'dd/MM') === dayStr).length;
    return { date: dayStr, leads: count };
  });
  const chartData = last30.slice(-14);

  const hotLeads = leads.filter(l => l.score === 'hot');
  const warmLeads = leads.filter(l => l.score === 'warm');
  const coldLeads = leads.filter(l => l.score === 'cold');
  const scoreData = [
    { name: 'Chauds', count: hotLeads.length, fill: 'hsl(0,72%,55%)' },
    { name: 'Tièdes', count: warmLeads.length, fill: 'hsl(35,92%,55%)' },
    { name: 'Froids', count: coldLeads.length, fill: 'hsl(220,80%,56%)' },
  ];

  const upcomingReminders = reminders.filter(r => !r.done).slice(0, 3);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 sm:space-y-8">
      <motion.div variants={item}>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vue d'ensemble de votre pipeline</p>
      </motion.div>

      {/* KPIs Row 1 */}
      <motion.div variants={item} className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Nouveaux leads (30j)"
          value={newLeads30d.length}
          subtitle={newLeads30dAlert ? '⚠ Volume bas, augmentez vos sources' : `${leads.length} total`}
          subtitleColor={newLeads30dAlert ? 'text-amber-400' : undefined}
          icon={Users}
          gradient="from-blue-500/20 to-blue-600/5"
          iconColor="text-blue-400"
        />
        <KpiCard
          label="Temps de réponse"
          value={hasResponseData ? (avgResponseHours >= 48 ? Math.round(avgResponseHours / 24) : avgResponseHours) : 0}
          suffix={hasResponseData ? (avgResponseHours >= 48 ? 'j' : 'h') : ''}
          subtitle={!hasResponseData ? 'Aucun lead contacté' : avgResponseHours > 24 ? '⚠ Trop lent, visez < 24h' : '✓ Bon tempo'}
          subtitleColor={!hasResponseData ? undefined : avgResponseHours > 24 ? 'text-amber-400' : 'text-emerald-400'}
          icon={Clock}
          gradient="from-amber-500/20 to-amber-600/5"
          iconColor="text-amber-400"
        />
        <KpiCard
          label="Taux de show-up"
          value={showRate}
          suffix="%"
          subtitle={leadsWithShowStatus.length > 0 ? `${showLeads.length}/${leadsWithShowStatus.length} présents` : 'Aucun RDV renseigné'}
          subtitleColor={showRate < 70 && leadsWithShowStatus.length > 0 ? 'text-red-400' : showRate >= 80 ? 'text-emerald-400' : undefined}
          icon={CalendarCheck}
          gradient="from-emerald-500/20 to-emerald-600/5"
          iconColor="text-emerald-400"
        />
        <KpiCard
          label="Tâches en attente"
          value={pendingReminders.length}
          subtitle={overdueReminders.length > 0 ? `🔴 ${overdueReminders.length} en retard` : 'Tout est à jour'}
          subtitleColor={overdueReminders.length > 0 ? 'text-red-400' : 'text-emerald-400'}
          icon={ListChecks}
          gradient="from-purple-500/20 to-purple-600/5"
          iconColor="text-purple-400"
        />
      </motion.div>

      {/* KPIs Row 2 */}
      <motion.div variants={item} className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Taux de closing"
          value={closingRate}
          suffix="%"
          subtitle={`${wonLeads.length} gagné / ${closingDenominator} en closing`}
          subtitleColor={closingRate >= 50 ? 'text-emerald-400' : closingRate >= 30 ? 'text-amber-400' : 'text-red-400'}
          icon={Target}
          gradient="from-emerald-500/20 to-emerald-600/5"
          iconColor="text-emerald-400"
        />
        <KpiCard
          label="Taux de qualification"
          value={qualificationRate}
          suffix="%"
          subtitle={`${interestedLeads.length} intéressés / ${interestedAndLost.length} total`}
          icon={UserCheck}
          gradient="from-indigo-500/20 to-indigo-600/5"
          iconColor="text-indigo-400"
        />
        <KpiCard
          label="Pipeline (propositions)"
          value={pipelineValue}
          subtitle={pipelineValue > 0 ? 'Deals en cours à closer' : 'Aucun deal en cours'}
          icon={TrendingUp}
          gradient="from-cyan-500/20 to-cyan-600/5"
          iconColor="text-cyan-400"
        />
        <KpiCard
          label="À relancer"
          value={leadsToRelaunch.length}
          subtitle={leadsToRelaunch.length > 0 ? '⚠ Action requise' : '✓ Pipeline actif'}
          subtitleColor={leadsToRelaunch.length > 3 ? 'text-red-400' : leadsToRelaunch.length > 0 ? 'text-amber-400' : 'text-emerald-400'}
          icon={RefreshCw}
          gradient="from-red-500/20 to-red-600/5"
          iconColor="text-red-400"
        />
      </motion.div>

      {/* Charts row */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4 text-foreground">Leads dans le temps</h2>
          <div className="h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225,12%,14%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215,12%,50%)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(215,12%,50%)' }} width={30} />
                <Tooltip contentStyle={{ background: 'hsl(225,14%,9%)', border: '1px solid hsl(225,12%,14%)', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: 'hsl(210,20%,95%)' }} />
                <Line type="monotone" dataKey="leads" stroke="hsl(220,80%,56%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(220,80%,56%)' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4 text-foreground">Répartition pipeline</h2>
          <div className="h-40 sm:h-48 flex items-center justify-center">
            {pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" label={isMobile ? false : ({ name, value }) => `${name}: ${value}`}>
                    {pipelineData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(225,14%,9%)', border: '1px solid hsl(225,12%,14%)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun lead</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Score distribution + Recent leads */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4 text-foreground">Score des leads</h2>
          <div className="h-36 sm:h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreData}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215,12%,50%)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(215,12%,50%)' }} width={30} />
                <Tooltip contentStyle={{ background: 'hsl(225,14%,9%)', border: '1px solid hsl(225,12%,14%)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-5 py-3 sm:py-4">
            <h2 className="text-sm font-semibold text-foreground">Leads récents</h2>
            <Link to="/leads" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {leads.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                Aucun lead. <Link to="/leads/new" className="text-primary hover:underline">Ajoutez votre premier lead</Link>
              </div>
            ) : (
              leads.slice(0, 5).map(lead => (
                <Link key={lead.id} to={`/leads/${lead.id}`} className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{lead.name}</span>
                      {lead.company_name && <span className="text-xs text-muted-foreground hidden sm:inline">· {lead.company_name}</span>}
                      <LeadScoreBadge score={lead.score} />
                      <LeadStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.message}</p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground font-mono">
                    {format(new Date(lead.created_at), 'dd MMM', { locale: fr })}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </motion.div>

      {/* Reminders */}
      <motion.div variants={item} className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-5 py-3 sm:py-4">
          <h2 className="text-sm font-semibold text-foreground">Prochaines actions</h2>
          <Link to="/reminders" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="divide-y divide-border/50">
          {upcomingReminders.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun rappel en attente</div>
          ) : (
            upcomingReminders.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <button onClick={() => toggleReminder.mutate({ id: r.id, done: true })} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-all">
                  <Check className="h-3 w-3 text-transparent" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.leads?.name || 'Lead'}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(r.due_date), "dd MMM HH:mm", { locale: fr })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.action}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}