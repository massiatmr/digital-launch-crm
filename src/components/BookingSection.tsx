import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  CalendarCheck, Loader2, Calendar as CalendarIcon,
  Download, Phone, Mail, User, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { format, isBefore, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function generateGoogleCalendarUrl(name: string, date: string, time: string, offerName: string) {
  const startDate = new Date(`${date}T${time}:00`);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `RDV — ${offerName}`,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: `Rendez-vous réservé pour : ${offerName}\nNom : ${name}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(name: string, date: string, time: string, offerName: string) {
  const startDate = new Date(`${date}T${time}:00`);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${fmt(startDate)}\nDTEND:${fmt(endDate)}\nSUMMARY:RDV — ${offerName}\nDESCRIPTION:Rendez-vous réservé pour ${offerName}\\nNom : ${name}\nEND:VEVENT\nEND:VCALENDAR`;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rendez-vous.ics';
  a.click();
  URL.revokeObjectURL(url);
}

const bookingSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().trim().email('Email invalide').max(255),
  phone: z.string().trim().min(6, 'Téléphone requis').max(20),
  booking_date: z.string().min(1, 'Date requise'),
  time_slot: z.string().min(1, 'Créneau requis'),
});

interface BookingSectionProps {
  offerId: string;
  ownerId: string;
  offerName: string;
  ctaText?: string;
  subtitle?: string;
  accentColor?: string; // tailwind class for accent, e.g. "red" or "indigo"
}

export default function BookingSection({
  offerId,
  ownerId,
  offerName,
  ctaText = 'Réserver un Appel',
  subtitle = 'Pour un devis sans engagement',
  accentColor = 'indigo',
}: BookingSectionProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', booking_date: '', time_slot: '' });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsSynced, setSlotsSynced] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchAvailability = useCallback(async (date: Date) => {
    setSlotsLoading(true);
    setAvailableSlots([]);
    setForm(f => ({ ...f, time_slot: '' }));
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('check-availability', {
        body: { offer_id: offerId, date: dateStr },
      });
      if (fnErr) throw fnErr;
      setAvailableSlots(data?.slots || []);
      setSlotsSynced(data?.synced || false);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (selectedDate) {
      setForm(f => ({ ...f, booking_date: format(selectedDate, 'yyyy-MM-dd') }));
      fetchAvailability(selectedDate);
    }
  }, [selectedDate, fetchAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = bookingSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => { fieldErrors[issue.path[0] as string] = issue.message; });
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('handle-booking', {
        body: { ...form, offer_id: offerId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
    } catch {
      toast.error('Erreur lors de la réservation');
    } finally {
      setSubmitting(false);
    }
  };

  const accentBg = `bg-${accentColor}-600`;
  const accentBgHover = `hover:bg-${accentColor}-500`;

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg mx-auto">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8 text-center">
          <CalendarCheck className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">Rendez-vous réservé !</h3>
          <p className="text-gray-400 mb-6">Nous vous contacterons pour confirmer votre créneau.</p>
          <p className="text-sm font-medium mb-3">Ajouter à votre agenda</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => window.open(generateGoogleCalendarUrl(form.name, form.booking_date, form.time_slot, offerName), '_blank')}
              className="border-white/10 text-white hover:bg-white/5"
            >
              <CalendarIcon className="h-4 w-4 mr-2" /> Google Calendar
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadIcs(form.name, form.booking_date, form.time_slot, offerName)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              <Download className="h-4 w-4 mr-2" /> Apple / Outlook (.ics)
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Calendar */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-red-500" />
          Choisissez une date
        </h3>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={fr}
          disabled={(date) => isBefore(date, startOfDay(new Date())) || date.getDay() === 0}
          className="pointer-events-auto mx-auto [&_.rdp-day]:text-white [&_.rdp-head_cell]:text-gray-500 [&_.rdp-caption_label]:text-white [&_.rdp-nav_button]:text-white [&_.rdp-nav_button]:hover:bg-white/10 [&_.rdp-day_selected]:bg-red-600 [&_.rdp-day_selected]:text-white [&_.rdp-day_today]:bg-white/10 [&_.rdp-day:hover]:bg-white/5"
        />

        {selectedDate && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-500" />
                Créneaux — {format(selectedDate, 'd MMMM yyyy', { locale: fr })}
              </h4>
              {slotsSynced && (
                <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                  Sync Calendar
                </Badge>
              )}
            </div>
            {slotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                <span className="ml-2 text-sm text-gray-400">Vérification des disponibilités…</span>
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Aucun créneau disponible ce jour</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, time_slot: slot }))}
                    className={cn(
                      "text-sm py-2.5 rounded-lg border transition-all font-medium",
                      form.time_slot === slot
                        ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/20"
                        : "bg-white/[0.03] border-white/[0.08] text-gray-300 hover:border-red-500/40 hover:bg-red-600/10"
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
            {errors.time_slot && <p className="text-xs text-red-400 mt-2">{errors.time_slot}</p>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <User className="h-5 w-5 text-red-500" />
          Vos informations
        </h3>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Nom complet *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Jean Dupont"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-red-500"
              />
            </div>
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Email *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type="email"
                placeholder="jean@exemple.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-red-500"
              />
            </div>
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Téléphone *</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type="tel"
                placeholder="06 12 34 56 78"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-red-500"
              />
            </div>
            {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
          </div>

          {selectedDate && form.time_slot && (
            <div className="p-4 rounded-xl bg-red-600/10 border border-red-500/20">
              <p className="text-sm text-red-300 font-medium">📅 Votre rendez-vous</p>
              <p className="text-white font-semibold mt-1">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })} à {form.time_slot}
              </p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-6 text-lg font-semibold shadow-lg shadow-red-600/25"
            disabled={submitting || !form.time_slot || !form.booking_date}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CalendarCheck className="h-5 w-5 mr-2" />}
            Confirmer le rendez-vous
          </Button>

          <p className="text-center text-xs text-gray-600">
            🔒 Vos données sont sécurisées et ne seront jamais partagées
          </p>
        </form>
      </div>
    </div>
  );
}
