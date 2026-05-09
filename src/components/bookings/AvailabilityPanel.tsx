import { useState } from 'react';
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
import { Loader2, X, CalendarOff, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

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

  const [morning, setMorning] = useState<string>('');
  const [afternoon, setAfternoon] = useState<string>('');

  if (isLoading || !settings) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const m = morning || settings.morning_slot;
  const a = afternoon || settings.afternoon_slot;
  const blackoutDates = blackouts.map(b => new Date(b.blackout_date + 'T12:00:00'));
  const blackoutById = new Map(blackouts.map(b => [b.blackout_date, b.id]));

  const toggleDay = async (d: number) => {
    const isOn = settings.working_days.includes(d);
    const next = isOn ? settings.working_days.filter(x => x !== d) : [...settings.working_days, d];
    await upsert.mutateAsync({ working_days: next.sort() });
  };

  const saveSlots = async () => {
    if (!/^\d{2}:\d{2}$/.test(m) || !/^\d{2}:\d{2}$/.test(a)) {
      toast.error('Format HH:MM attendu');
      return;
    }
    await upsert.mutateAsync({ morning_slot: m, afternoon_slot: a });
    toast.success('Créneaux mis à jour');
  };

  const handleBlackoutSelect = (date: Date | undefined) => {
    if (!date) return;
    const key = format(date, 'yyyy-MM-dd');
    toggleBlackout.mutate({ date: key, existingId: blackoutById.get(key) });
  };

  return (
    <Card className="border-white/5 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Disponibilités
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Créneaux IA proposés (par jour)</Label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Fin de matinée</Label>
              <Input type="time" value={m} onChange={e => setMorning(e.target.value)} step={900} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Après-midi</Label>
              <Input type="time" value={a} onChange={e => setAfternoon(e.target.value)} step={900} />
            </div>
          </div>
          <Button size="sm" className="mt-2 w-full" onClick={saveSlots} disabled={upsert.isPending}>
            Enregistrer les créneaux
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
