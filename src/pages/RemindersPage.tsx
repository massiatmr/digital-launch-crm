import { useReminders, useToggleReminder, useUpdateReminder } from '@/hooks/useLeadData';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Clock, Loader2, Pencil, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

function ReminderCard({ r, isPending }: { r: any; isPending: boolean }) {
  const toggleReminder = useToggleReminder();
  const updateReminder = useUpdateReminder();
  const [editing, setEditing] = useState(false);
  const [editAction, setEditAction] = useState(r.action);
  const [editDate, setEditDate] = useState<Date>(new Date(r.due_date));

  const now = new Date();
  const dueDate = new Date(r.due_date);
  const isOverdue = isPending && dueDate < now;

  const handleSave = () => {
    updateReminder.mutate({
      id: r.id,
      action: editAction,
      due_date: editDate.toISOString(),
    });
    setEditing(false);
  };

  if (!isPending) {
    return (
      <div className={cn("flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-3 opacity-60")}>
        <button
          onClick={() => toggleReminder.mutate({ id: r.id, done: false })}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/20"
        >
          <Check className="h-3 w-3 text-primary" />
        </button>
        <span className="text-sm line-through">{r.leads?.name || 'Lead'} — {r.action}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-start gap-4 rounded-xl border px-5 py-4",
      isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
    )}>
      <button
        onClick={() => toggleReminder.mutate({ id: r.id, done: true })}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors mt-0.5"
      >
        <Check className="h-3 w-3 text-transparent" />
      </button>

      {editing ? (
        <div className="flex-1 space-y-2">
          <Input
            value={editAction}
            onChange={(e) => setEditAction(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {format(editDate, "dd MMM yyyy HH:mm", { locale: fr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editDate}
                  onSelect={(d) => d && setEditDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), editDate.getHours(), editDate.getMinutes()))}
                  className="p-3 pointer-events-auto"
                />
                <div className="px-3 pb-3">
                  <Input
                    type="time"
                    value={format(editDate, "HH:mm")}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setEditDate(new Date(editDate.getFullYear(), editDate.getMonth(), editDate.getDate(), h, m));
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="ghost" className="h-8" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditing(false); setEditAction(r.action); setEditDate(new Date(r.due_date)); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm">{r.leads?.name || 'Lead'}</span>
            <p className="text-sm text-muted-foreground">{r.action}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={cn("flex items-center gap-1.5 text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
              <Clock className="h-3 w-3" />
              {format(dueDate, "dd MMM à HH:mm", { locale: fr })}
              {isOverdue && <span className="ml-1">⚠️</span>}
            </div>
            <button onClick={() => setEditing(true)} className="ml-2 p-1 rounded hover:bg-muted transition-colors">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function RemindersPage() {
  const { data: reminders = [], isLoading } = useReminders();

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
              <ReminderCard key={r.id} r={r} isPending={true} />
            ))}
          </div>

          {done.length > 0 && (
            <div>
              <h2 className="font-heading text-lg text-muted-foreground mb-3">Terminés</h2>
              <div className="space-y-2">
                {done.map(r => (
                  <ReminderCard key={r.id} r={r} isPending={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
