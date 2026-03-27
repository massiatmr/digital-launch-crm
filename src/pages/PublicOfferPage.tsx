import { useParams } from 'react-router-dom';
import { useOfferBySlug, useOfferPage } from '@/hooks/useOfferData';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  CalendarCheck, Check, Loader2, ArrowRight, Calendar as CalendarIcon,
  Download, Shield, AlertCircle, Star, Phone, Mail, User, Clock,
  ChevronDown, Sparkles, Target, Zap
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { format, isBefore, startOfDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────

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
  phone: z.string().trim().max(20).optional(),
  booking_date: z.string().min(1, 'Date requise'),
  time_slot: z.string().min(1, 'Créneau requis'),
});

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

// ─── Component ──────────────────────────────────────────────

export default function PublicOfferPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: offer, isLoading, error } = useOfferBySlug(slug);
  const { data: offerPage } = useOfferPage(offer?.id);

  const [form, setForm] = useState({ name: '', email: '', phone: '', booking_date: '', time_slot: '' });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsSynced, setSlotsSynced] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch availability when date changes
  const fetchAvailability = useCallback(async (date: Date) => {
    if (!offer) return;
    setSlotsLoading(true);
    setAvailableSlots([]);
    setForm(f => ({ ...f, time_slot: '' }));
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('check-availability', {
        body: { owner_id: offer.owner_id, date: dateStr },
      });
      if (fnErr) throw fnErr;
      setAvailableSlots(data?.slots || []);
      setSlotsSynced(data?.synced || false);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [offer]);

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
    if (!offer) return;
    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('handle-booking', {
        body: { ...form, offer_id: offer.id, owner_id: offer.owner_id },
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

  const scrollToBooking = () => document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center"><h1 className="text-2xl font-bold text-white">Offre introuvable</h1></div>
      </div>
    );
  }

  const headline = offerPage?.headline || offer.name;
  const subheadline = offerPage?.subheadline || offer.description;
  const ctaText = offerPage?.cta_text || 'Réserver un Appel';
  const features = Array.isArray(offer.features) ? offer.features : [];
  const sections = Array.isArray(offerPage?.sections) ? offerPage.sections : [];
  const testimonials = Array.isArray(offerPage?.testimonials) ? offerPage.testimonials : [];

  const painPoints = sections.find((s: any) => s.type === 'pain_points');
  const solution = sections.find((s: any) => s.type === 'solution');
  const guarantee = sections.find((s: any) => s.type === 'guarantee');
  const portfolio = sections.find((s: any) => s.type === 'portfolio');

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* ─── Sticky Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">{offer.name}</span>
          <Button
            size="sm"
            onClick={scrollToBooking}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-6"
          >
            {ctaText}
          </Button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-600/10 via-transparent to-transparent pointer-events-none" />
        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.7 }}
        >
          {offer.niche && (
            <Badge className="mb-6 bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30 text-sm px-4 py-1.5">
              {offer.niche}
            </Badge>
          )}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.1] tracking-tight">
            {headline}
          </h1>
          {subheadline && (
            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              {subheadline}
            </p>
          )}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              onClick={scrollToBooking}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-10 py-6 text-lg font-semibold shadow-lg shadow-indigo-600/25"
            >
              {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            {offer.price && (
              <span className="text-sm text-gray-500">
                {offer.price}
              </span>
            )}
          </div>
          {guarantee && (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-emerald-400">
              <Shield className="h-4 w-4" />
              <span>Garantie de remboursement à 100%</span>
            </div>
          )}
        </motion.div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-6 w-6 text-gray-600" />
        </div>
      </section>

      {/* ─── Pain Points ─── */}
      {painPoints && Array.isArray(painPoints.items) && painPoints.items.length > 0 && (
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
                {painPoints.title || 'Est-ce que cela vous ressemble ?'}
              </h2>
              <div className="space-y-4">
                {painPoints.items.map((item: string, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-red-500/20 transition-colors"
                  >
                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-gray-300 leading-relaxed">{item}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Solution ─── */}
      {solution && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-indigo-600/[0.03] to-transparent">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
              <div className="text-center mb-10">
                <Sparkles className="h-8 w-8 text-indigo-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">
                  {solution.title || 'Et bien c\'est votre jour de chance !'}
                </h2>
              </div>
              {Array.isArray(solution.items) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {solution.items.map((item: string, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                    >
                      <Check className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-gray-300">{item}</span>
                    </motion.div>
                  ))}
                </div>
              )}
              {solution.description && (
                <p className="text-center text-gray-400 mt-8 text-lg">{solution.description}</p>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Features ─── */}
      {features.length > 0 && (
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
              <div className="text-center mb-12">
                <Zap className="h-8 w-8 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">Ce qui est inclus</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {features.map((f: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <Check className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" />
                    <span className="text-gray-300 text-sm">
                      {typeof f === 'string' ? f : f.label || f.text || JSON.stringify(f)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Portfolio ─── */}
      {portfolio && Array.isArray(portfolio.items) && portfolio.items.length > 0 && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-12">
                <Target className="h-8 w-8 text-indigo-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">{portfolio.title || 'Nos Réalisations'}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {portfolio.items.map((item: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]"
                  >
                    {item.image && (
                      <img src={item.image} alt={item.title || ''} className="w-full h-48 object-cover" />
                    )}
                    <div className="p-5">
                      {item.title && <h3 className="font-semibold text-lg mb-1">{item.title}</h3>}
                      {item.description && <p className="text-sm text-gray-400">{item.description}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Guarantee ─── */}
      {guarantee && (
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/[0.04] p-8 sm:p-12 text-center">
                <Shield className="h-14 w-14 text-emerald-400 mx-auto mb-6" />
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  {guarantee.title || 'Garantie de remboursement à 100%'}
                </h2>
                <p className="text-gray-400 text-lg leading-relaxed max-w-xl mx-auto">
                  {guarantee.description || 'Aucun risque pour vous. Tout le risque est sur nous.'}
                </p>
                <Button
                  size="lg"
                  onClick={scrollToBooking}
                  className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-10"
                >
                  {ctaText}
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {testimonials.length > 0 && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-indigo-600/[0.03] to-transparent">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
                Ce que disent nos clients
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {testimonials.map((t: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <div className="flex gap-1 mb-3">
                      {Array.from({ length: t.rating || 5 }).map((_, si) => (
                        <Star key={si} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-gray-300 italic mb-4">"{t.text}"</p>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    {t.company && <p className="text-xs text-gray-500">{t.company}</p>}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Booking Section ─── */}
      <section id="booking-section" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-12">
              <CalendarCheck className="h-10 w-10 text-indigo-400 mx-auto mb-4" />
              <h2 className="text-3xl sm:text-4xl font-bold">{ctaText}</h2>
              <p className="text-gray-400 mt-3">Pour un devis sans engagement</p>
            </div>

            {submitted ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg mx-auto">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8 text-center">
                  <CalendarCheck className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Rendez-vous réservé !</h3>
                  <p className="text-gray-400 mb-6">Nous vous contacterons pour confirmer votre créneau.</p>
                  <p className="text-sm font-medium mb-3">Ajouter à votre agenda</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={() => window.open(generateGoogleCalendarUrl(form.name, form.booking_date, form.time_slot, offer.name), '_blank')}
                      className="border-white/10 text-white hover:bg-white/5"
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" /> Google Calendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => downloadIcs(form.name, form.booking_date, form.time_slot, offer.name)}
                      className="border-white/10 text-white hover:bg-white/5"
                    >
                      <Download className="h-4 w-4 mr-2" /> Apple / Outlook (.ics)
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Calendar */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-indigo-400" />
                    Choisissez une date
                  </h3>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={fr}
                    disabled={(date) => isBefore(date, startOfDay(new Date())) || date.getDay() === 0}
                    className="pointer-events-auto mx-auto [&_.rdp-day]:text-white [&_.rdp-head_cell]:text-gray-500 [&_.rdp-caption_label]:text-white [&_.rdp-nav_button]:text-white [&_.rdp-nav_button]:hover:bg-white/10 [&_.rdp-day_selected]:bg-indigo-600 [&_.rdp-day_selected]:text-white [&_.rdp-day_today]:bg-white/10 [&_.rdp-day:hover]:bg-white/5"
                  />

                  {selectedDate && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4 text-indigo-400" />
                          Créneaux disponibles — {format(selectedDate, 'd MMMM yyyy', { locale: fr })}
                        </h4>
                        {slotsSynced && (
                          <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                            Sync Google Calendar
                          </Badge>
                        )}
                      </div>
                      {slotsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
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
                                  ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20"
                                  : "bg-white/[0.03] border-white/[0.08] text-gray-300 hover:border-indigo-500/40 hover:bg-indigo-600/10"
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
                    <User className="h-5 w-5 text-indigo-400" />
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
                          className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-indigo-500"
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
                          className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-indigo-500"
                        />
                      </div>
                      {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 mb-1.5 block">Téléphone (optionnel)</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          type="tel"
                          placeholder="06 12 34 56 78"
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          className="pl-10 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {selectedDate && form.time_slot && (
                      <div className="p-4 rounded-xl bg-indigo-600/10 border border-indigo-500/20">
                        <p className="text-sm text-indigo-300 font-medium">📅 Votre rendez-vous</p>
                        <p className="text-white font-semibold mt-1">
                          {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })} à {form.time_slot}
                        </p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-6 text-lg font-semibold shadow-lg shadow-indigo-600/25"
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
            )}
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.06] py-10 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-gray-600">
          <p>© {new Date().getFullYear()} {offer.name}. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
