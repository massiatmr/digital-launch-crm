import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { DbLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { useAvailabilitySettings } from '@/hooks/useAvailabilitySettings';
import { getViewerTz } from '@/lib/bookingTime';
import { Button } from '@/components/ui/button';
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
  const [submitting, setSubmitting] = useState(false);
  const { data: offers = [], isLoading: offersLoading } = useOffers();
  const { data: availability } = useAvailabilitySettings();
  const queryClient = useQueryClient();
  const activeOffers = useMemo(() => offers.filter((offer) => offer.is_active), [offers]);
  const minDate = format(new Date(), 'yyyy-MM-dd');

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

  const loadSlots = useCallback(async (nextOfferId: string, nextDate: string) => {
    setSlot('');
    setSlots([]);
    if (!nextOfferId || !nextDate) return;
    setLoadingSlots(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-availability', {
        body: { offer_id: nextOfferId, date: nextDate },
      });
      if (error) throw error;
      setSlots(Array.isArray(data?.slots) ? data.slots : []);
    } catch {
      toast.error('Impossible de charger les créneaux disponibles');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const selectOffer = (value: string) => {
    setOfferId(value);
    void loadSlots(value, date);
  };

  const selectDate = (value: string) => {
    setDate(value);
    void loadSlots(offerId, value);
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
          client_timezone: getViewerTz(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-bookings', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['lead-activities', lead.id] }),
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="booking-date">Date</Label>
              <Input id="booking-date" type="date" min={minDate} value={date} onChange={(event) => selectDate(event.target.value)} className="h-11 text-base sm:text-sm" />
            </div>
            <div className="grid gap-2">
              <Label>Durée</Label>
              <div className="flex h-11 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> {availability?.slot_duration_minutes ?? 60} min
              </div>
            </div>
          </div>

          {date && (
            <div className="grid gap-2">
              <Label>Créneau disponible</Label>
              {loadingSlots ? (
                <div className="flex min-h-16 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : slots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((time) => (
                    <Button key={time} type="button" size="sm" variant={slot === time ? 'default' : 'outline'} onClick={() => setSlot(time)} className="h-10 font-mono">
                      {time}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Aucun créneau disponible ce jour.</p>
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