import { useReminders, useToggleReminder, type DbReminder } from '@/hooks/useLeadData';
import { CreateTaskForLeadDialog } from '@/components/CreateTaskForLeadDialog';
import { Check, Clock, Loader2 } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function LeadTasksSection({ leadId, leadName }: { leadId: string; leadName?: string }) {
  const { data: all = [], isLoading } = useReminders();
  const toggle = useToggleReminder();
  const tasks = (all as DbReminder[])
    .filter((r) => r.lead_id === leadId)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Tâches & rappels
          {tasks.filter((t) => !t.done).length > 0 && (
            <span className="text-xs font-mono text-muted-foreground">
              ({tasks.filter((t) => !t.done).length})
            </span>
          )}
        </h3>
        <CreateTaskForLeadDialog leadId={leadId} leadName={leadName} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">Aucune tâche pour ce lead.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {tasks.map((t) => {
              const due = new Date(t.due_date);
              const overdue = !t.done && isPast(due) && !isToday(due);
              const today = !t.done && isToday(due);
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    t.done
                      ? 'border-border/30 bg-background/30 opacity-60'
                      : overdue
                      ? 'border-destructive/30 bg-destructive/5'
                      : today
                      ? 'border-amber-400/30 bg-amber-400/5'
                      : 'border-border/50 bg-background/40'
                  )}
                >
                  <button
                    onClick={() => toggle.mutate({ id: t.id, done: !t.done })}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      t.done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary'
                    )}
                  >
                    {t.done && <Check className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', t.done && 'line-through text-muted-foreground')}>
                      {t.action}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span
                        className={cn(
                          overdue && 'text-destructive',
                          today && 'text-amber-400'
                        )}
                      >
                        {format(due, "EEE d MMM 'à' HH:mm", { locale: fr })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
