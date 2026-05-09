import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Bot, Clock, X, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useScheduledFollowups, useCancelFollowup, useRescheduleFollowup,
} from '@/hooks/useConversationControls';
import { addDays, addHours } from 'date-fns';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const TASK_LABELS: Record<string, string> = {
  initial_message: 'Message initial',
  followup_1: 'Relance #1',
  followup_2: 'Relance #2',
  last_followup: 'Dernière relance',
  template_24h: 'Réactivation template',
  qualification: 'Qualification IA',
};

export default function ScheduledFollowupsPage() {
  const { data: tasks = [], isLoading } = useScheduledFollowups();
  const cancel = useCancelFollowup();
  const reschedule = useRescheduleFollowup();

  const grouped = useMemo(() => {
    const out: Record<string, any[]> = { 'Aujourd\'hui': [], 'Demain': [], 'Cette semaine': [], 'Plus tard': [] };
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endToday = startToday + 86400000;
    const endTomorrow = endToday + 86400000;
    const endWeek = startToday + 7 * 86400000;
    for (const t of tasks) {
      const ts = new Date(t.scheduled_at).getTime();
      if (ts < endToday) out['Aujourd\'hui'].push(t);
      else if (ts < endTomorrow) out['Demain'].push(t);
      else if (ts < endWeek) out['Cette semaine'].push(t);
      else out['Plus tard'].push(t);
    }
    return out;
  }, [tasks]);

  return (
    <div className="container max-w-4xl py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link to="/conversations"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="font-heading text-lg flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Relances programmées
          <Badge variant="outline" className="ml-1">{tasks.length}</Badge>
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune relance auto programmée.
        </div>
      ) : (
        Object.entries(grouped).map(([k, list]) =>
          list.length === 0 ? null : (
            <section key={k} className="space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-medium px-1">{k} · {list.length}</h2>
              <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
                {list.map((t) => {
                  const when = new Date(t.scheduled_at);
                  return (
                    <div key={t.id} className="px-3 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{t.lead?.name ?? 'Lead inconnu'}</span>
                          <Badge variant="outline" className="text-[10px]">{TASK_LABELS[t.task_type] || t.task_type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(when, 'EEE d MMM HH:mm', { locale: fr })} · {formatDistanceToNow(when, { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Ouvrir conversation">
                          <Link to={`/conversations?lead=${t.lead_id}`}><MessageCircle className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                              <Clock className="h-3 w-3" /> Reporter
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: t.id, when: addHours(new Date(), 24).toISOString() })}>+ 24h</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: t.id, when: addDays(new Date(), 3).toISOString() })}>+ 3 jours</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: t.id, when: addDays(new Date(), 7).toISOString() })}>+ 7 jours</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => cancel.mutate(t.id)}
                          title="Annuler"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )
      )}
    </div>
  );
}
