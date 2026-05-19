import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAvailabilitySettings } from '@/hooks/useAvailabilitySettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, CheckCircle2, X, Globe } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getViewerTz, tzShortLabel, viewerTimeLabel, OWNER_DEFAULT_TZ } from '@/lib/bookingTime';

type SlotStatus = 'past' | 'non_working' | 'blackout' | 'booked' | 'busy' | 'free' | 'out_of_range';
interface DayData {
  date: string; dow: number; working: boolean; blackout: boolean; is_past: boolean; beyond_max?: boolean;
  slots: { time: string; status: SlotStatus }[];
}

const STATUS_STYLES: Record<SlotStatus, { label: string; className: string; dot: string }> = {
  free:         { label: 'Libre',     className: 'bg-green-500/10 text-green-300 border-green-500/30 hover:bg-green-500/20', dot: 'bg-green-500' },
  busy:         { label: 'Google',    className: 'bg-orange-500/10 text-orange-300 border-orange-500/30 line-through opacity-70', dot: 'bg-orange-500' },
  booked:       { label: 'RDV',       className: 'bg-primary/15 text-primary border-primary/30', dot: 'bg-primary' },
  past:         { label: 'Passé',     className: 'bg-muted/20 text-muted-foreground/40 border-white/5 line-through opacity-50', dot: 'bg-muted' },
  non_working:  { label: 'Off',       className: 'bg-muted/20 text-muted-foreground/40 border-white/5 opacity-40', dot: 'bg-muted' },
  blackout:     { label: 'Vacances',  className: 'bg-destructive/10 text-destructive border-destructive/30 line-through opacity-70', dot: 'bg-destructive' },
  out_of_range: { label: 'Trop loin', className: 'bg-muted/10 text-muted-foreground/40 border-white/5 opacity-40 line-through', dot: 'bg-muted' },
};

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}

export function WeekAvailabilityView({ selectedDate, onSelectDate }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { data: availability } = useAvailabilitySettings();
  const ownerTz = availability?.timezone || OWNER_DEFAULT_TZ;
  const ownerTzLabel = tzShortLabel(ownerTz);
  const viewerTz = getViewerTz();
  const viewerTzLabel = tzShortLabel(viewerTz);
  const showViewer = viewerTz !== ownerTz;
  const dateFrom = format(weekStart, 'yyyy-MM-dd');
  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-availability', dateFrom],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-availability', {
        body: { date_from: dateFrom },
      });
      if (error) throw error;
      return data as {
        days: DayData[];
        synced: boolean;
        day_start_time: string;
        day_end_time: string;
        slot_duration_minutes: number;
        max_future_days: number;
      };
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
          {data && (
            <span className="text-muted-foreground/70">
              · {data.day_start_time}–{data.day_end_time} · {data.slot_duration_minutes}min
            </span>
          )}
          <span className="flex items-center gap-1 text-muted-foreground/80">
            <Globe className="h-3 w-3" /> Horaires <span className="text-foreground font-medium">{ownerTzLabel}</span>
            {showViewer && <span className="opacity-70">· chez vous : {viewerTzLabel}</span>}
          </span>
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
          <div className="space-y-2">
            {days.map(day => {
              const d = parseISO(day.date);
              const isSel = isSameDay(d, selectedDate);
              const isToday = isSameDay(d, new Date());
              const dayDisabled = day.is_past || !day.working || day.blackout || day.beyond_max;
              const freeCount = day.slots.filter(s => s.status === 'free').length;

              return (
                <div
                  key={day.date}
                  className={cn(
                    'rounded-lg border transition-all',
                    isSel ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'border-white/5 bg-background/40',
                    dayDisabled && 'opacity-70'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(d)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 rounded-t-lg"
                  >
                    <div className="flex flex-col items-center justify-center w-12 shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {format(d, 'EEE', { locale: fr })}
                      </span>
                      <span className={cn(
                        'text-lg font-semibold tabular-nums leading-none',
                        day.is_past && 'text-muted-foreground/50',
                        isToday && 'text-primary'
                      )}>
                        {format(d, 'd')}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {format(d, 'MMM', { locale: fr })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {day.beyond_max ? (
                          <span className="text-muted-foreground">Hors plage de réservation</span>
                        ) : day.blackout ? (
                          <span className="text-destructive">Vacances</span>
                        ) : !day.working ? (
                          <span className="text-muted-foreground">Jour off</span>
                        ) : day.is_past ? (
                          <span className="text-muted-foreground">Passé</span>
                        ) : (
                          <span>{freeCount} créneau{freeCount > 1 ? 'x' : ''} libre{freeCount > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {day.slots.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
                      {day.slots.map(s => {
                        const st = STATUS_STYLES[s.status];
                        return (
                          <div
                            key={s.time}
                            className={cn(
                              'rounded-md border px-2 py-1 text-xs flex items-center gap-1.5 font-mono',
                              st.className
                            )}
                            title={`${s.time} – ${st.label}`}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', st.dot)} />
                            {s.time}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
