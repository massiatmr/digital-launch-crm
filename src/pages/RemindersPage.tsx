import { useReminders, useToggleReminder } from '@/hooks/useLeadData';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RemindersPage() {
  const { data: reminders = [], isLoading } = useReminders();
  const toggleReminder = useToggleReminder();

  const pending = reminders.filter(r => !r.done);
  const done = reminders.filter(r => r.done);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Rappels</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pending.length} actions en attente</p>
      </div>

      {pending.length === 0 && done.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Aucun rappel. Les rappels sont créés automatiquement quand vous ajoutez des leads.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <button
                  onClick={() => toggleReminder.mutate({ id: r.id, done: true })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors"
                >
                  <Check className="h-3 w-3 text-transparent" />
                </button>
                <div className="flex-1">
                  <span className="font-medium text-sm">{r.leads?.name || 'Lead'}</span>
                  <p className="text-sm text-muted-foreground">{r.action}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(r.due_date), "dd MMM à HH:mm", { locale: fr })}
                </div>
              </div>
            ))}
          </div>

          {done.length > 0 && (
            <div>
              <h2 className="font-heading text-lg text-muted-foreground mb-3">Terminés</h2>
              <div className="space-y-2">
                {done.map(r => (
                  <div key={r.id} className={cn("flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-3 opacity-60")}>
                    <button
                      onClick={() => toggleReminder.mutate({ id: r.id, done: false })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/20"
                    >
                      <Check className="h-3 w-3 text-primary" />
                    </button>
                    <span className="text-sm line-through">{r.leads?.name || 'Lead'} — {r.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
