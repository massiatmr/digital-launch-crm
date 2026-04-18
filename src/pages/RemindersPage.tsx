import { useReminders, useToggleReminder, useUpdateReminder } from '@/hooks/useLeadData';
import { format, addDays, setHours, setMinutes, startOfDay, isSameDay, isToday, isTomorrow, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Clock, Loader2, Pencil, X, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const QUICK_TIMES = [
  { label: '08:00', h: 8, m: 0 },
  { label: '09:00', h: 9, m: 0 },
  { label: '10:00', h: 10, m: 0 },
  { label: '11:00', h: 11, m: 0 },
  { label: '12:00', h: 12, m: 0 },
  { label: '14:00', h: 14, m: 0 },
  { label: '15:00', h: 15, m: 0 },
  { label: '16:00', h: 16, m: 0 },
  { label: '17:00', h: 17, m: 0 },
  { label: '18:00', h: 18, m: 0 },
];

function DateTimePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [viewMonth, setViewMonth] = useState(() => startOfDay(new Date(value.getFullYear(), value.getMonth(), 1)));

  const days = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const result: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) result.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      result.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    return result;
  }, [viewMonth]);

  const selectDay = (d: Date) => {
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), value.getHours(), value.getMinutes()));
  };

  const selectTime = (h: number, m: number) => {
    onChange(setMinutes(setHours(value, h), m));
  };

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const quickDates = [
    { label: "Aujourd'hui", date: new Date() },
    { label: 'Demain', date: addDays(new Date(), 1) },
    { label: 'Dans 3 jours', date: addDays(new Date(), 3) },
    { label: 'Dans 1 semaine', date: addWeeks(new Date(), 1) },
  ];

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Quick date chips */}
      <div className="flex gap-1.5 px-3 pt-3 pb-2 flex-wrap">
        {quickDates.map(q => (
          <button
            key={q.label}
            type="button"
            onClick={() => selectDay(q.date)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              isSameDay(value, q.date)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: fr })}
          </span>
          <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
          ))}
          {days.map((d, i) => (
            <div key={i} className="flex items-center justify-center">
              {d ? (
                <button
                  type="button"
                  onClick={() => selectDay(d)}
                  className={cn(
                    "h-7 w-7 rounded-full text-xs transition-colors",
                    isSameDay(d, value) && "bg-primary text-primary-foreground font-bold",
                    !isSameDay(d, value) && isToday(d) && "border border-primary text-primary",
                    !isSameDay(d, value) && !isToday(d) && "hover:bg-muted text-foreground",
                    d < startOfDay(new Date()) && !isSameDay(d, value) && "text-muted-foreground/50"
                  )}
                >
                  {d.getDate()}
                </button>
              ) : <div className="h-7 w-7" />}
            </div>
          ))}
        </div>
      </div>

      {/* Time picker */}
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Heure</span>
          <Input
            type="time"
            value={format(value, "HH:mm")}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              if (!isNaN(h) && !isNaN(m)) selectTime(h, m);
            }}
            className="h-7 w-24 text-xs ml-auto"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUICK_TIMES.map(t => (
            <button
              key={t.label}
              type="button"
              onClick={() => selectTime(t.h, t.m)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] transition-colors",
                value.getHours() === t.h && value.getMinutes() === t.m
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReminderCard({ r, isPending, highlighted }: { r: any; isPending: boolean; highlighted?: boolean }) {
  const toggleReminder = useToggleReminder();
  const updateReminder = useUpdateReminder();
  const [editing, setEditing] = useState(false);
  const [editAction, setEditAction] = useState(r.action);
  const [editDate, setEditDate] = useState<Date>(new Date(r.due_date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlighted]);

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
    setShowDatePicker(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setShowDatePicker(false);
    setEditAction(r.action);
    setEditDate(new Date(r.due_date));
  };

  const formatRelativeDate = (d: Date) => {
    if (isToday(d)) return `Aujourd'hui à ${format(d, 'HH:mm')}`;
    if (isTomorrow(d)) return `Demain à ${format(d, 'HH:mm')}`;
    return format(d, "dd MMM à HH:mm", { locale: fr });
  };

  if (!isPending) {
    return (
      <div ref={cardRef} className={cn("flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-3 opacity-60", highlighted && 'highlight-flash')}>
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
    <div ref={cardRef} className={cn(
      "rounded-xl border px-5 py-4 transition-colors",
      isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
      highlighted && 'highlight-flash'
    )}>
      <div className="flex items-start gap-4">
        <button
          onClick={() => toggleReminder.mutate({ id: r.id, done: true })}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors mt-0.5"
        >
          <Check className="h-3 w-3 text-transparent" />
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editAction}
              onChange={(e) => setEditAction(e.target.value)}
              className="h-8 text-sm mb-2"
              autoFocus
            />
          ) : (
            <>
              <span className="font-medium text-sm">{r.leads?.name || 'Lead'}</span>
              <p className="text-sm text-muted-foreground">{r.action}</p>
            </>
          )}

          {/* Date display / edit trigger */}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => { setEditing(true); setShowDatePicker(!showDatePicker); }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors",
                editing && showDatePicker
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : isOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              <CalendarDays className="h-3 w-3" />
              {formatRelativeDate(editing ? editDate : dueDate)}
              {isOverdue && !editing && <span className="ml-0.5">⚠️</span>}
            </button>

            {!editing && (
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}

            {editing && (
              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" onClick={handleSave} className="h-7 text-xs px-3">
                  Enregistrer
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs px-2">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline date picker */}
      {editing && showDatePicker && (
        <div className="mt-3 ml-10">
          <DateTimePicker value={editDate} onChange={setEditDate} />
        </div>
      )}
    </div>
  );
}

export default function RemindersPage() {
  const { data: reminders = [], isLoading } = useReminders();
  const [params, setParams] = useSearchParams();
  const highlightId = params.get('highlight');

  // Strip the highlight param after the animation
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete('highlight');
      setParams(next, { replace: true });
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

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
              <ReminderCard key={r.id} r={r} isPending={true} highlighted={r.id === highlightId} />
            ))}
          </div>

          {done.length > 0 && (
            <div>
              <h2 className="font-heading text-lg text-muted-foreground mb-3">Terminés</h2>
              <div className="space-y-2">
                {done.map(r => (
                  <ReminderCard key={r.id} r={r} isPending={false} highlighted={r.id === highlightId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
