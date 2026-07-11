import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  useAvailabilitySettings,
  useUpsertAvailabilitySettings,
  useBlackouts,
  useToggleBlackout,
} from '@/hooks/useAvailabilitySettings';
import { Loader2, X, CalendarOff, Clock, Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { getViewerTz, tzShortLabel } from '@/lib/bookingTime';

const TZ_OPTIONS = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Brussels',
  'Europe/Madrid',
  'Africa/Algiers',
  'Africa/Casablanca',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const DAYS = [
  { v: 1, label: 'Lun' },
  { v: 2, label: 'Mar' },
  { v: 3, label: 'Mer' },
  { v: 4, label: 'Jeu' },
  { v: 5, label: 'Ven' },
  { v: 6, label: 'Sam' },
  { v: 0, label: 'Dim' },
];

export function AvailabilityPanel() {
  const { data: settings, isLoading } = useAvailabilitySettings();
  const { data: blackouts = [] } = useBlackouts();
  const upsert = useUpsertAvailabilitySettings();
  const toggleBlackout = useToggleBlackout();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [duration, setDuration] = useState<number>(45);
  const [interval, setInterval] = useState<number>(60);
  const [maxDays, setMaxDays] = useState<number>(14);
  const [minLeadHours, setMinLeadHours] = useState<number>(2);
  const [dayHours, setDayHours] = useState<Record<string, { start: string; end: string }>>({});

  useEffect(() => {
    if (settings) {
      setStart(settings.day_start_time);
      setEnd(settings.day_end_time);
      setDuration(settings.slot_duration_minutes);
      setInterval(settings.slot_interval_minutes ?? 60);
      setMaxDays(settings.max_future_days);
      setMinLeadHours(settings.min_lead_time_hours ?? 2);
      setDayHours((settings.day_hours as any) ?? {});
    }
  }, [settings?.workspace_id, settings?.owner_id, settings?.day_start_time, settings?.day_end_time, settings?.slot_duration_minutes, settings?.slot_interval_minutes, settings?.max_future_days, settings?.min_lead_time_hours]);

  if (isLoading || !settings) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const blackoutDates = blackouts.map(b => new Date(b.blackout_date + 'T12:00:00'));
  const blackoutById = new Map(blackouts.map(b => [b.blackout_date, b.id]));

  const toggleDay = async (d: number) => {
    const isOn = settings.working_days.includes(d);
    const next = isOn ? settings.working_days.filter(x => x !== d) : [...settings.working_days, d];
    await upsert.mutateAsync({ working_days: next.sort() });
  };

  const saveHours = async () => {
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      toast.error('Format HH:MM attendu');
      return;
    }
    if (start >= end) {
      toast.error("L'heure de fin doit être après l'heure de début");
      return;
    }
    if (duration < 15 || duration > 240) {
      toast.error('Durée entre 15 et 240 minutes');
      return;
    }
    if (maxDays < 1 || maxDays > 90) {
      toast.error('1 à 90 jours');
      return;
    }
    if (minLeadHours < 0 || minLeadHours > 168) {
      toast.error('Délai minimum entre 0 et 168h');
      return;
    }
    // Validate per-day overrides
    const cleaned: Record<string, { start: string; end: string }> = {};
    for (const [k, v] of Object.entries(dayHours)) {
      if (!v?.start || !v?.end) continue;
      if (!/^\d{2}:\d{2}$/.test(v.start) || !/^\d{2}:\d{2}$/.test(v.end)) {
        toast.error(`Format HH:MM invalide pour le jour ${k}`);
        return;
      }
      if (v.start >= v.end) {
        toast.error(`Fin doit être après début (jour ${k})`);
        return;
      }
      cleaned[k] = { start: v.start, end: v.end };
    }
    await upsert.mutateAsync({
      day_start_time: start,
      day_end_time: end,
      slot_duration_minutes: duration,
      max_future_days: maxDays,
      min_lead_time_hours: minLeadHours,
      day_hours: cleaned as any,
    } as any);
    toast.success('Disponibilités mises à jour');
  };

  const handleBlackoutSelect = (date: Date | undefined) => {
    if (!date) return;
    const key = format(date, 'yyyy-MM-dd');
    toggleBlackout.mutate({ date: key, existingId: blackoutById.get(key) });
  };

  // Aperçu des créneaux générés
  const previewSlots: string[] = (() => {
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) return [];
    const out: string[] = [];
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let t = startMin; t + duration <= endMin; t += 60) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    return out;
  })();

  return (
    <Card className="border-white/5 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Disponibilités
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Globe className="h-3 w-3" /> Fuseau horaire
          </Label>
          <Select
            value={settings.timezone}
            onValueChange={async (v) => { await upsert.mutateAsync({ timezone: v } as any); toast.success('Fuseau mis à jour'); }}
          >
            <SelectTrigger className="mt-2 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TZ_OPTIONS.map(tz => (
                <SelectItem key={tz} value={tz} className="text-sm">
                  {tzShortLabel(tz)} <span className="text-muted-foreground ml-1">({tz})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Tous tes créneaux sont stockés et affichés dans ce fuseau. Ton navigateur est sur <span className="text-foreground font-medium">{tzShortLabel(getViewerTz())}</span>.
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Jours travaillés</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {DAYS.map(d => {
              const on = settings.working_days.includes(d.v);
              return (
                <Button
                  key={d.v}
                  type="button"
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  className={on ? '' : 'opacity-60'}
                  onClick={() => toggleDay(d.v)}
                >
                  {d.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Plage horaire par défaut (créneaux toutes les heures)</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Début</Label>
              <Input type="time" value={start} onChange={e => setStart(e.target.value)} step={900} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Fin</Label>
              <Input type="time" value={end} onChange={e => setEnd(e.target.value)} step={900} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Durée RDV (min)</Label>
              <Input type="number" min={15} max={240} step={5} value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Max jours futurs</Label>
              <Input type="number" min={1} max={90} value={maxDays} onChange={e => setMaxDays(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Délai minimum avant un RDV (heures)</Label>
            <Input type="number" min={0} max={168} value={minLeadHours} onChange={e => setMinLeadHours(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-1">
              Empêche la réservation d'un créneau qui commence dans moins de {minLeadHours}h.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Horaires personnalisés par jour (optionnel)</Label>
            <p className="text-[11px] text-muted-foreground">Laisse vide pour utiliser la plage par défaut ci-dessus.</p>
            <div className="space-y-1.5">
              {DAYS.filter(d => settings.working_days.includes(d.v)).map(d => {
                const key = String(d.v);
                const override = dayHours[key];
                const enabled = !!(override?.start || override?.end);
                return (
                  <div key={d.v} className="flex items-center gap-2">
                    <div className="w-10 text-xs text-muted-foreground">{d.label}</div>
                    {enabled ? (
                      <>
                        <Input
                          type="time"
                          step={900}
                          className="h-8 text-xs"
                          value={override?.start ?? start}
                          onChange={e => setDayHours(prev => ({ ...prev, [key]: { start: e.target.value, end: prev[key]?.end ?? end } }))}
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          type="time"
                          step={900}
                          className="h-8 text-xs"
                          value={override?.end ?? end}
                          onChange={e => setDayHours(prev => ({ ...prev, [key]: { start: prev[key]?.start ?? start, end: e.target.value } }))}
                        />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setDayHours(prev => { const n = { ...prev }; delete n[key]; return n; })}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 text-[11px] flex-1 justify-start text-muted-foreground" onClick={() => setDayHours(prev => ({ ...prev, [key]: { start, end } }))}>
                        Personnaliser ({start}–{end})
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>




          {previewSlots.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {previewSlots.map(s => (
                <Badge key={s} variant="outline" className="text-[10px] font-mono bg-primary/5 border-primary/20">
                  {s}
                </Badge>
              ))}
              <span className="text-[10px] text-muted-foreground self-center ml-1">
                · {duration} min · jusqu'à {maxDays}j
              </span>
            </div>
          )}
          <Button size="sm" className="w-full" onClick={saveHours} disabled={upsert.isPending}>
            Enregistrer
          </Button>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <CalendarOff className="h-3 w-3" /> Jours OFF (vacances)
          </Label>
          <p className="text-[11px] text-muted-foreground mt-1">Clique une date pour la bloquer / débloquer.</p>
          <div className="mt-2 rounded-lg border border-white/5 bg-background/40 p-2 flex justify-center">
            <Calendar
              mode="single"
              onSelect={handleBlackoutSelect}
              modifiers={{ blackout: blackoutDates }}
              modifiersClassNames={{ blackout: 'bg-destructive/30 text-destructive-foreground line-through' }}
              locale={fr}
            />
          </div>
          {blackouts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {blackouts.map(b => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-destructive/10 text-xs"
                  onClick={() => toggleBlackout.mutate({ date: b.blackout_date, existingId: b.id })}
                >
                  {format(new Date(b.blackout_date + 'T12:00:00'), 'dd MMM', { locale: fr })}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
