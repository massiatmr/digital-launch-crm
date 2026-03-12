import { mockReminders } from '@/data/mockData';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RemindersPage() {
  const [reminders, setReminders] = useState(mockReminders);

  const toggleDone = (id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r));
  };

  const pending = reminders.filter(r => !r.done);
  const done = reminders.filter(r => r.done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Rappels</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pending.length} actions en attente</p>
      </div>

      <div className="space-y-3">
        {pending.map(r => (
          <div key={r.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
            <button
              onClick={() => toggleDone(r.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors"
            >
              <Check className="h-3 w-3 text-transparent" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{r.leadName}</span>
              </div>
              <p className="text-sm text-muted-foreground">{r.action}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {format(new Date(r.dueDate), "dd MMM à HH:mm", { locale: fr })}
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
                  onClick={() => toggleDone(r.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/20"
                >
                  <Check className="h-3 w-3 text-primary" />
                </button>
                <div className="flex-1">
                  <span className="text-sm line-through">{r.leadName} — {r.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
