import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, CheckCircle2, X, Clock } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type SlotStatus = 'past' | 'non_working' | 'blackout' | 'booked' | 'busy' | 'free';
interface DayData {
  date: string; dow: number; working: boolean; blackout: boolean; is_past: boolean;
  slots: { time: string; status: SlotStatus }[];
}

const STATUS_STYLES: Record<SlotStatus, { label: string; className: string; dot: string }> = {
  free:        { label: 'Libre',         className: 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20', dot: 'bg-green-500' },
  busy:        { label: 'Google',        className: 'bg-orange-500/10 text-orange-400 border-orange-500/30 line-through opacity-70', dot: 'bg-orange-500' },
  booked:      { label: 'RDV',           className: 'bg-primary/15 text-primary border-primary/30', dot: 'bg-primary' },
  past:        { label: 'Passé',         className: 'bg-muted/30 text-muted-foreground/50 border-white/5 line-through opacity-50', dot: 'bg-muted' },
  non_working: { label: 'Off',           className: 'bg-muted/20 text-muted-foreground/50 border-white/5 opacity-50', dot: 'bg-muted' },
  blackout:    { label: 'Vacances',      className: 'bg-destructive/10 text-destructive border-destructive/30 line-through opacity-70', dot: 'bg-destructive' },
};

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}

export function WeekAvailabilityView({ selectedDate, onSelectDate }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const dateFrom = format(weekStart, 'yyyy-MM-dd');
  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-availability', dateFrom],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-availability', {
        body: { date_from: dateFrom },
      });
      if (error) throw error;
      return data as { days: DayData[]; synced: boolean; morning_slot: string; afternoon_slot: string };
    },
    refetchInterval: 60_000,
  });

  const days = data?.days ?? [];

  const summary = useMemo(() => {
    let free = 0, busy = 0, booked = 0;
    days.forEach(d => d.slots.forEach(s => {
      if (s.status === 'free') free++;
      else if (s.status === 'busy') busy++;
      else if (s.status === 'booked') booked++;
    }));
    return { free, busy, booked };
  }, [days]);

  return (
    <Card className="border-white/5 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalIcon className="h-4 w-4 text-primary" />
            Semaine du {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => {
              const t = startOfWeek(new Date(), { weekStartsOn: 1 });
              setWeekStart(t);
              onSelectDate(new Date());
            }}>
              Cette semaine
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {summary.free} libres</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> {summary.busy} Google</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> {summary.booked} RDV</span>
          {data?.synced ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 gap-1 ml-auto">
              <CheckCircle2 className="h-3 w-3" /> Google sync
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted/20 text-muted-foreground gap-1 ml-auto">
              <X className="h-3 w-3" /> Google off
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(day => {
              const d = parseISO(day.date);
              const isSel = isSameDay(d, selectedDate);
              const dayDisabled = day.is_past || !day.working || day.blackout;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate(d)}
                  className={cn(
                    'rounded-lg border p-2 text-left transition-all flex flex-col gap-1.5 min-h-[120px]',
                    isSel ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'border-white/5 bg-background/40 hover:border-white/20',
                    dayDisabled && 'opacity-60'
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {format(d, 'EEE', { locale: fr })}
                    </span>
                    <span className={cn(
                      'text-sm font-semibold tabular-nums',
                      day.is_past && 'text-muted-foreground/50',
                      isSameDay(d, new Date()) && 'text-primary'
                    )}>
                      {format(d, 'd')}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {day.slots.map(s => {
                      const st = STATUS_STYLES[s.status];
                      return (
                        <div
                          key={s.time}
                          className={cn(
                            'rounded-md border px-1.5 py-1 text-[10px] flex items-center justify-between gap-1',
                            st.className
                          )}
                          title={`${s.time} – ${st.label}`}
                        >
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="h-2.5 w-2.5" />
                            {s.time}
                          </span>
                          <span className="hidden sm:inline truncate">{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
