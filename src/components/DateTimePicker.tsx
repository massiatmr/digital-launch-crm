import { useState, useMemo } from 'react';
import { format, addDays, addWeeks, setHours, setMinutes, startOfDay, isSameDay, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const QUICK_TIMES = [
  { label: '08:00', h: 8, m: 0 }, { label: '09:00', h: 9, m: 0 }, { label: '10:00', h: 10, m: 0 },
  { label: '11:00', h: 11, m: 0 }, { label: '12:00', h: 12, m: 0 }, { label: '14:00', h: 14, m: 0 },
  { label: '15:00', h: 15, m: 0 }, { label: '16:00', h: 16, m: 0 }, { label: '17:00', h: 17, m: 0 },
  { label: '18:00', h: 18, m: 0 },
];

export function DateTimePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [viewMonth, setViewMonth] = useState(() => startOfDay(new Date(value.getFullYear(), value.getMonth(), 1)));

  const days = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const result: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) result.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      result.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    return result;
  }, [viewMonth]);

  const selectDay = (d: Date) => onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), value.getHours(), value.getMinutes()));
  const selectTime = (h: number, m: number) => onChange(setMinutes(setHours(value, h), m));
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
      <div className="flex gap-1.5 px-3 pt-3 pb-2 flex-wrap">
        {quickDates.map(q => (
          <button key={q.label} type="button" onClick={() => selectDay(q.date)}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              isSameDay(value, q.date) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium capitalize">{format(viewMonth, 'MMMM yyyy', { locale: fr })}</span>
          <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
          ))}
          {days.map((d, i) => (
            <div key={i} className="flex items-center justify-center">
              {d ? (
                <button type="button" onClick={() => selectDay(d)}
                  className={cn("h-7 w-7 rounded-full text-xs transition-colors",
                    isSameDay(d, value) && "bg-primary text-primary-foreground font-bold",
                    !isSameDay(d, value) && isToday(d) && "border border-primary text-primary",
                    !isSameDay(d, value) && !isToday(d) && "hover:bg-muted text-foreground",
                    d < startOfDay(new Date()) && !isSameDay(d, value) && "text-muted-foreground/50")}>
                  {d.getDate()}
                </button>
              ) : <div className="h-7 w-7" />}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Heure</span>
          <Input type="time" value={format(value, "HH:mm")}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              if (!isNaN(h) && !isNaN(m)) selectTime(h, m);
            }}
            className="h-7 w-24 text-xs ml-auto" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUICK_TIMES.map(t => (
            <button key={t.label} type="button" onClick={() => selectTime(t.h, t.m)}
              className={cn("px-2 py-0.5 rounded text-[11px] transition-colors",
                value.getHours() === t.h && value.getMinutes() === t.m
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted text-muted-foreground hover:bg-accent")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
