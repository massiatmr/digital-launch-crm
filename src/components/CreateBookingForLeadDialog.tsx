import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Clock, Globe, Loader2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { DbLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { useAvailabilitySettings } from '@/hooks/useAvailabilitySettings';
import { formatTimeInTz, getViewerTz, tzShortLabel, wallTimeToUtc } from '@/lib/bookingTime';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const bookingSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(100),
  email: z.string().trim().email('Email invalide').max(255),
  phone: z.string().trim().min(6, 'Téléphone requis').max(30),
  offerId: z.string().uuid('Choisis une offre'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date requise'),
  slot: z.string().regex(/^\d{2}:\d{2}$/, 'Créneau requis'),
  notes: z.string().trim().max(2000),
});

type Props = {
  lead: DbLead;
};

type DayAvailability = { slots: string[]; reason?: string; error?: boolean };

const unavailableLabels: Record<string, string> = {
  non_working_day: 'Ce jour est fermé.',
  blackout: 'Ce jour est indisponible.',
  out_of_range: 'Cette date dépasse la période de réservation.',
};

const TIME_ZONES = [
  'Europe/Paris', 'Africa/Algiers', 'Africa/Casablanca', 'Europe/London',
  'Europe/Brussels', 'Europe/Madrid', 'Africa/Tunis', 'America/New_York',
  'America/Los_Angeles', 'UTC',
];

function dateInTimeZone(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
}

export function CreateBookingForLeadDialog({ lead }: Props) {
  const [open, setOpen] = useState(false);
  const [offerId, setOfferId] = useState(lead.offer_id ?? '');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [name, setName] = useState(lead.name ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [days, setDays] = useState<Record<string, DayAvailability>>({});
  const [loadingDays, setLoadingDays] = useState(false);
  const [calendarError, setCalendarError] = useState(false);
  const [displayTimeZone, setDisplayTimeZone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: offers = [], isLoading: offersLoading } = useOffers();
  const { data: availability } = useAvailabilitySettings();
  const queryClient = useQueryClient();
  const activeOffers = useMemo(() => offers.filter((offer) => offer.is_active), [offers]);
  const ownerTimeZone = availability?.timezone ?? 'Europe/Paris';
  const chosenTimeZone = displayTimeZone || ownerTimeZone;
  const timeZones = useMemo(() => Array.from(new Set([ownerTimeZone, getViewerTz(), ...TIME_ZONES])), [ownerTimeZone]);
  const today = dateInTimeZone(availability?.timezone ?? 'Europe/Paris');
  const maxFutureDays = availability?.max_future_days ?? 14;
  const maxDate = addDays(new Date(`${today}T12:00:00`), maxFutureDays);

  useEffect(() => {
    if (!open) return;
    setName(lead.name ?? '');
    setEmail(lead.email ?? '');
    setPhone(lead.phone ?? '');
    const preferred = lead.offer_id && activeOffers.some((offer) => offer.id === lead.offer_id)
      ? lead.offer_id
      : activeOffers[0]?.id ?? '';
    setOfferId(preferred);
  }, [activeOffers, lead, open]);

  // The month uses the same endpoint as the selected day, so its available-day markers
  // cannot disagree with the actual bookable slots (including Google Calendar conflicts).
  useEffect(() => {
    if (!open || !offerId || !availability) return;
    let cancelled = false;
    setDays({});
    setLoadingDays(true);
    setCalendarError(false);
    const dates = Array.from({ length: maxFutureDays + 1 }, (_, index) => addDays(new Date(`${today}T12:00:00`), index))
      .filter(day => availability.working_days.includes(day.getDay()))
      .map(day => format(day, 'yyyy-MM-dd'));

    async function fetchDays() {
      const results: Record<string, DayAvailability> = {};
      for (let i = 0; i < dates.length; i += 5) {
        const batch = await Promise.all(dates.slice(i, i + 5).map(async day => {
          try {
            const { data, error } = await supabase.functions.invoke('check-availability', { body: { offer_id: offerId, date: day } });
            if (error || data?.error || !Array.isArray(data?.slots)) throw error ?? new Error(data?.error ?? 'Invalid availability');
            return [day, { slots: data.slots as string[], reason: data.reason } as DayAvailability] as const;
          } catch {
            return [day, { slots: [], error: true } as DayAvailability] as const;
          }
        }));
        if (cancelled) return;
        for (const [day, value] of batch) results[day] = value;
        setDays({ ...results });
      }
      if (!cancelled) {
        setCalendarError(Object.values(results).some(result => result.error));
        setLoadingDays(false);
      }
    }
    void fetchDays();
    return () => { cancelled = true; };
  }, [open, offerId, availability, today, maxFutureDays]);

  useEffect(() => {
    const day = days[date];
    if (!day || !date) return;
    setSlots(day.slots);
    setLoadingSlots(false);
  }, [days, date]);

  const selectOffer = (value: string) => {
    setOfferId(value);
    setDate('');
    setSlot('');
    setSlots([]);
  };

  const selectDate = (value: Date | undefined) => {
    const nextDate = value ? format(value, 'yyyy-MM-dd') : '';
    setDate(nextDate);
    setSlot('');
    setSlots(days[nextDate]?.slots ?? []);
    setLoadingSlots(!!nextDate && !days[nextDate]);
  };

  const displaySlot = (time: string) => {
    if (chosenTimeZone === ownerTimeZone) return time;
    const instant = wallTimeToUtc(date, time, ownerTimeZone);
    const localDate = dateInTimeZoneAt(instant, chosenTimeZone);
    const dayHint = localDate < date ? ' · veille' : localDate > date ? ' · lendemain' : '';
    return `${formatTimeInTz(instant, chosenTimeZone)}${dayHint}`;
  };

  const submit = async () => {
    const parsed = bookingSchema.safeParse({ name, email, phone, offerId, date, slot, notes });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Vérifie les informations du rendez-vous');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-booking', {
        body: {
          lead_id: lead.id,
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          offer_id: parsed.data.offerId,
          booking_date: parsed.data.date,
          time_slot: parsed.data.slot,
          notes: parsed.data.notes,
          client_timezone: chosenTimeZone,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-bookings', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      ]);
      toast.success('Rendez-vous créé');
      setOpen(false);
      setDate('');
      setSlot('');
      setNotes('');
      setSlots([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer le rendez-vous');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="min-h-12 w-full justify-center gap-2 text-base sm:h-10 sm:w-auto sm:text-sm">
          <CalendarPlus className="h-4 w-4" />
          Créer un rendez-vous
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un rendez-vous</DialogTitle>
          <DialogDescription>Le rendez-vous sera rattaché à {lead.name}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="booking-offer">Offre</Label>
            <Select value={offerId} onValueChange={selectOffer} disabled={offersLoading || submitting}>
              <SelectTrigger id="booking-offer" className="h-11 text-base sm:text-sm"><SelectValue placeholder="Choisir une offre" /></SelectTrigger>
              <SelectContent>
                {activeOffers.map((offer) => <SelectItem key={offer.id} value={offer.id}>{offer.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!offersLoading && activeOffers.length === 0 && <p className="text-sm text-destructive">Aucune offre active dans cet espace.</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="booking-timezone" className="flex items-center gap-2"><Globe className="h-4 w-4" /> Fuseau horaire</Label>
            <Select value={chosenTimeZone} onValueChange={(value) => { setDisplayTimeZone(value); setSlot(''); }} disabled={submitting}>
              <SelectTrigger id="booking-timezone" className="h-11 text-base sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {timeZones.map((timeZone) => (
                  <SelectItem key={timeZone} value={timeZone}>{tzShortLabel(timeZone)} ({timeZone}){timeZone === ownerTimeZone ? ' · espace' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosenTimeZone !== ownerTimeZone && <p className="text-xs text-muted-foreground">Les dates suivent l’agenda de {tzShortLabel(ownerTimeZone)} ; les heures ci-dessous sont en heure de {tzShortLabel(chosenTimeZone)}.</p>}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Choisir une date</Label>
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {availability?.slot_duration_minutes ?? 45} min</span>
            </div>
            <Calendar
              mode="single"
              locale={fr}
              selected={date ? new Date(`${date}T12:00:00`) : undefined}
              onSelect={selectDate}
              disabled={(day) => {
                const key = format(day, 'yyyy-MM-dd');
                return key < today || day > maxDate || !availability?.working_days.includes(day.getDay()) || (!loadingDays && !!days[key] && days[key].slots.length === 0 && !days[key].error);
              }}
              modifiers={{ available: (day) => (days[format(day, 'yyyy-MM-dd')]?.slots.length ?? 0) > 0 }}
              modifiersClassNames={{ available: 'font-semibold text-emerald-400 ring-1 ring-emerald-500/40 rounded-md' }}
              className="pointer-events-auto mx-auto max-w-full p-1 sm:p-3"
            />
            <p className="text-xs text-muted-foreground">
              {loadingDays ? 'Recherche des disponibilités…' : calendarError ? 'Certaines dates n’ont pas pu être vérifiées. Réessaie plus tard.' : 'Les dates marquées en vert ont des créneaux libres.'}
            </p>
          </div>

          {date && (
            <div className="grid gap-2">
              <Label>Créneaux — {format(new Date(`${date}T12:00:00`), 'd MMMM yyyy', { locale: fr })}</Label>
              {loadingSlots ? (
                <div className="flex min-h-16 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : days[date]?.error ? (
                <p className="text-sm text-destructive">Impossible de vérifier cette date. Réessaie plus tard.</p>
              ) : slots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((time) => (
                    <Button key={time} type="button" size="sm" variant={slot === time ? 'default' : 'outline'} onClick={() => setSlot(time)} title={chosenTimeZone === ownerTimeZone ? time : `${time} · ${tzShortLabel(ownerTimeZone)}`} className="h-auto min-h-10 flex-col gap-0.5 py-1 font-mono text-xs sm:text-sm">
                      <span>{displaySlot(time)}</span>
                      {chosenTimeZone !== ownerTimeZone && <span className="text-[10px] opacity-70">{time} {tzShortLabel(ownerTimeZone)}</span>}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{unavailableLabels[days[date]?.reason ?? ''] ?? 'Aucun créneau libre ce jour pour cette offre.'}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="booking-name">Nom</Label><Input id="booking-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="h-11 text-base sm:text-sm" /></div>
            <div className="grid gap-2"><Label htmlFor="booking-phone">Téléphone</Label><Input id="booking-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} className="h-11 text-base sm:text-sm" /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="booking-email">Email</Label><Input id="booking-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} className="h-11 text-base sm:text-sm" /></div>
          <div className="grid gap-2"><Label htmlFor="booking-notes">Notes</Label><Textarea id="booking-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Informations utiles pour le rendez-vous" className="resize-none text-base sm:text-sm" /></div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || loadingSlots || !slot || activeOffers.length === 0}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer le rendez-vous
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}