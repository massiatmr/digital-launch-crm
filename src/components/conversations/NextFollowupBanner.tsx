import { useState } from 'react';
import { formatDistanceToNow, format, addHours, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bot, X, Clock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNextFollowup, useCancelFollowup, useRescheduleFollowup } from '@/hooks/useConversationControls';
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

export function NextFollowupBanner({ leadId, paused }: { leadId: string; paused: boolean }) {
  const { data: tasks = [] } = useNextFollowup(leadId);
  const cancel = useCancelFollowup();
  const reschedule = useRescheduleFollowup();
  const [open, setOpen] = useState(false);

  if (paused) return null;
  const next = tasks[0];
  if (!next) return null;

  const remaining = tasks.length - 1;
  const when = new Date(next.scheduled_at);

  return (
    <div className="border-b border-border bg-primary/5 px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
      <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="text-foreground/90">
        Relance auto <span className="font-medium">{TASK_LABELS[next.task_type] || next.task_type}</span> {' '}
        <span className="text-muted-foreground">
          {formatDistanceToNow(when, { addSuffix: true, locale: fr })} ({format(when, 'd MMM HH:mm', { locale: fr })})
        </span>
      </span>
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1">
              <Clock className="h-3 w-3" /> Reporter <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: next.id, when: addHours(new Date(), 24).toISOString() })}>
              + 24 heures
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: next.id, when: addDays(new Date(), 3).toISOString() })}>
              + 3 jours
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => reschedule.mutate({ taskId: next.id, when: addDays(new Date(), 7).toISOString() })}>
              + 7 jours
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm" variant="ghost"
          className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
          onClick={() => cancel.mutate(next.id)}
        >
          <X className="h-3 w-3" /> Annuler
        </Button>
        {remaining > 0 && (
          <span className="text-[10px] text-muted-foreground ml-1">+{remaining} autres</span>
        )}
      </div>
    </div>
  );
}
