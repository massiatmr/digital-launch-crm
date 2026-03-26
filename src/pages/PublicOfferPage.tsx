import { useParams } from 'react-router-dom';
import { useOfferBySlug, useOfferPage } from '@/hooks/useOfferData';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Check, Loader2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { z } from 'zod';

const bookingSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().trim().email('Email invalide').max(255),
  phone: z.string().trim().max(20).optional(),
  booking_date: z.string().min(1, 'Date requise'),
  time_slot: z.string().min(1, 'Créneau requis'),
});

const TIME_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

export default function PublicOfferPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: offer, isLoading, error } = useOfferBySlug(slug);
  const { data: offerPage } = useOfferPage(offer?.id);
  const [form, setForm] = useState({ name: '', email: '', phone: '', booking_date: '', time_slot: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        body: {
          ...form,
          offer_id: offer.id,
          owner_id: offer.owner_id,
        },
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center"><h1 className="text-2xl font-bold text-foreground">Offre introuvable</h1></div>
      </div>
    );
  }

  const headline = offerPage?.headline || offer.name;
  const subheadline = offerPage?.subheadline || offer.description;
  const ctaText = offerPage?.cta_text || 'Réserver un rendez-vous';
  const features = Array.isArray(offer.features) ? offer.features : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative px-4 pt-20 pb-16 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          {offer.niche && <Badge className="mb-4">{offer.niche}</Badge>}
          <h1 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight">{headline}</h1>
          {subheadline && <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">{subheadline}</p>}
          {offer.price && <p className="mt-6 text-3xl font-bold text-primary">{offer.price}</p>}
          <Button size="lg" className="mt-8" onClick={() => document.getElementById('booking-form')?.scrollIntoView({ behavior: 'smooth' })}>
            {ctaText}<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </section>

      {/* Features */}
      {features.length > 0 && (
        <section className="px-4 py-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">Ce qui est inclus</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f: any, i: number) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <Check className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{typeof f === 'string' ? f : f.label || f.text || JSON.stringify(f)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Booking form */}
      <section id="booking-form" className="px-4 py-16 max-w-lg mx-auto">
        {submitted ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <CalendarCheck className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground">Rendez-vous réservé !</h3>
                <p className="text-sm text-muted-foreground mt-2">Nous vous contacterons pour confirmer votre créneau.</p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5 text-primary" />{ctaText}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Input placeholder="Votre nom" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <Input type="email" placeholder="Votre email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                  </div>
                  <Input type="tel" placeholder="Téléphone (optionnel)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  <div>
                    <Input type="date" value={form.booking_date} onChange={e => setForm(f => ({ ...f, booking_date: e.target.value }))} min={new Date().toISOString().split('T')[0]} />
                    {errors.booking_date && <p className="text-xs text-destructive mt-1">{errors.booking_date}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Choisir un créneau</p>
                    <div className="grid grid-cols-4 gap-2">
                      {TIME_SLOTS.map(slot => (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => setForm(f => ({ ...f, time_slot: slot }))}
                          className={`text-sm py-2 rounded-md border transition-colors ${form.time_slot === slot ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border hover:border-primary/50'}`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                    {errors.time_slot && <p className="text-xs text-destructive mt-1">{errors.time_slot}</p>}
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={createBooking.isPending}>
                    {createBooking.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmer le rendez-vous
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </section>
    </div>
  );
}
