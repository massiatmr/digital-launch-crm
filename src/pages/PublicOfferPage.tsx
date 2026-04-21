import { useParams } from 'react-router-dom';
import { useOfferBySlug, useOfferPage } from '@/hooks/useOfferData';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import BookingSection from '@/components/BookingSection';
import {
  CalendarCheck, Check, Loader2, ArrowRight,
  Shield, AlertCircle, Star, ChevronDown, Sparkles, Target, Zap,
  AlertTriangle, Clock, TrendingDown, Frown, Rocket, Gift, Trophy, Gem, type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  AlertTriangle, AlertCircle, Clock, TrendingDown, Frown, Zap,
  Rocket, Target, Gift, Shield, Star, Trophy, Gem, Sparkles, Check,
};
const HormoziIcon = ({ name, className }: { name: string; className?: string }) => {
  const C = ICON_MAP[name] || Sparkles;
  return <C className={className} />;
};
import { useState } from 'react';
import { motion } from 'framer-motion';
import DemenageurLanding from '@/pages/landing/demenageur';

// Custom page registry: slug → component
const CUSTOM_PAGES: Record<string, React.ComponentType<{ offer: any }>> = {
  // Add custom landing pages here by slug
  // 'demenageur': DemenageurLanding,
};

// Auto-detect custom pages by keywords in slug/niche
function getCustomPage(slug: string, niche?: string | null) {
  // Exact match first
  if (CUSTOM_PAGES[slug]) return CUSTOM_PAGES[slug];
  // Keyword matching for déménageur variants
  const demenageurKeywords = ['demenag', 'déménag', 'moving', 'demenagement'];
  const text = `${slug} ${niche || ''}`.toLowerCase();
  if (demenageurKeywords.some(k => text.includes(k))) return DemenageurLanding;
  return null;
}

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

export default function PublicOfferPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: offer, isLoading, error } = useOfferBySlug(slug);
  const { data: offerPage } = useOfferPage(offer?.id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  // Check for custom landing page
  const CustomPage = getCustomPage(offer.slug, offer.niche);
  if (CustomPage) {
    return <CustomPage offer={offer} />;
  }

  // ─── Generic template (fallback) ───
  const headline = offerPage?.headline || offer.name;
  const subheadline = offerPage?.subheadline || offer.description;
  const ctaText = offerPage?.cta_text || 'Réserver un Appel';
  const features = Array.isArray(offer.features) ? offer.features : [];
  const allSections = Array.isArray(offerPage?.sections) ? offerPage.sections : [];
  const sections = allSections.filter((s: any) => !s?.hidden);
  const testimonials = Array.isArray(offerPage?.testimonials) ? offerPage.testimonials : [];
  const showPrice = (offer as any).show_price === true;

  const painPoints = sections.find((s: any) => s.type === 'pain_points');
  const isHormoziPain = painPoints?.variant === 'hormozi';
  const solution = sections.find((s: any) => s.type === 'solution');
  const transformation = sections.find((s: any) => s.type === 'transformation');
  const deliverables = sections.find((s: any) => s.type === 'deliverables');
  const bonuses = sections.find((s: any) => s.type === 'bonuses');
  const faq = sections.find((s: any) => s.type === 'faq');
  const pricing = showPrice ? sections.find((s: any) => s.type === 'pricing') : null;
  const guarantee = sections.find((s: any) => s.type === 'guarantee');
  const portfolio = sections.find((s: any) => s.type === 'portfolio');

  const scrollToBooking = () => document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* ─── Sticky Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">{offer.name}</span>
          <Button size="sm" onClick={scrollToBooking} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6">
            {ctaText}
          </Button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
        <motion.div className="max-w-4xl mx-auto text-center relative" initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.7 }}>
          {offer.niche && (
            <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 text-sm px-4 py-1.5">
              {offer.niche}
            </Badge>
          )}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.1] tracking-tight">{headline}</h1>
          {subheadline && <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">{subheadline}</p>}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" onClick={scrollToBooking} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-10 py-6 text-lg font-semibold shadow-lg">
              {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            {(offer as any).show_price && offer.price && <span className="text-sm text-gray-500">{offer.price}</span>}
          </div>
          {guarantee && (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-emerald-400">
              <Shield className="h-4 w-4" /><span>Garantie de remboursement à 100%</span>
            </div>
          )}
        </motion.div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 animate-bounce"><ChevronDown className="h-6 w-6 text-gray-600" /></div>
      </section>

      {/* ─── Pain Points ─── */}
      {painPoints && Array.isArray(painPoints.items) && painPoints.items.length > 0 && (
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">{painPoints.title || 'Est-ce que cela vous ressemble ?'}</h2>
              <div className="space-y-4">
                {painPoints.items.map((item: any, i: number) => {
                  const isObj = isHormoziPain && typeof item === 'object';
                  const iconName = isObj ? item.icon : 'AlertCircle';
                  const title = isObj ? item.title : null;
                  const desc = isObj ? item.description : (typeof item === 'string' ? item : '');
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-red-500/20 transition-colors">
                      <HormoziIcon name={iconName} className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        {title && <p className="font-semibold text-white mb-1">{title}</p>}
                        <p className="text-gray-300 leading-relaxed">{desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Transformation Before/After (Hormozi) ─── */}
      {transformation && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-primary/[0.04] to-transparent">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">La transformation</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-red-950/20 border border-red-900/30">
                  <p className="text-xs font-bold text-red-400 mb-3 tracking-wider">AVANT</p>
                  <p className="text-gray-300 leading-relaxed">{transformation.before}</p>
                </div>
                <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-900/30">
                  <p className="text-xs font-bold text-emerald-400 mb-3 tracking-wider">APRÈS</p>
                  <p className="text-gray-300 leading-relaxed">{transformation.after}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Deliverables / Value Stack (Hormozi) ─── */}
      {deliverables && Array.isArray(deliverables.items) && deliverables.items.length > 0 && (
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-12">
                <Zap className="h-8 w-8 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">{deliverables.title || 'Tout ce que tu obtiens'}</h2>
              </div>
              <div className="space-y-4">
                {deliverables.items.map((d: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <HormoziIcon name={d.icon} className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-white">{d.title}</p>
                        {d.value && <span className="text-sm font-bold text-emerald-400 shrink-0">{d.value}</span>}
                      </div>
                      <p className="text-gray-400 text-sm mt-1 leading-relaxed">{d.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {deliverables.total_value > 0 && (
                <p className="text-center mt-8 text-gray-400">
                  Valeur totale : <span className="text-2xl font-black text-white">{deliverables.total_value}€</span>
                </p>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Bonuses (Hormozi) ─── */}
      {bonuses && Array.isArray(bonuses.items) && bonuses.items.length > 0 && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-yellow-500/[0.04] to-transparent">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-10">
                <Gift className="h-8 w-8 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">{bonuses.title || 'Bonus exclusifs'}</h2>
              </div>
              <div className="space-y-4">
                {bonuses.items.map((b: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    className="p-5 rounded-xl bg-yellow-500/[0.05] border border-yellow-500/20">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-white">🎁 {b.title}</p>
                      {b.value && <span className="text-sm font-bold text-yellow-400 shrink-0">{b.value}</span>}
                    </div>
                    <p className="text-gray-400 text-sm mt-2 leading-relaxed">{b.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Pricing (Hormozi) ─── */}
      {pricing && (
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <p className="text-sm text-gray-500 uppercase tracking-wider mb-3">Investissement</p>
              {pricing.anchor && <p className="text-2xl text-gray-500 line-through mb-2">{pricing.anchor}</p>}
              <p className="text-6xl sm:text-7xl font-black text-primary">{pricing.final}</p>
              <Button size="lg" onClick={scrollToBooking} className="mt-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-10 py-6 text-lg font-semibold">
                {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Solution ─── */}
      {solution && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-10">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">{solution.title || "Et bien c'est votre jour de chance !"}</h2>
              </div>
              {Array.isArray(solution.items) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {solution.items.map((item: string, i: number) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <Check className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-gray-300">{item}</span>
                    </motion.div>
                  ))}
                </div>
              )}
              {solution.description && <p className="text-center text-gray-400 mt-8 text-lg">{solution.description}</p>}
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Features (masqué si on a des deliverables Hormozi) ─── */}
      {features.length > 0 && !deliverables && (
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-12">
                <Zap className="h-8 w-8 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">Ce qui est inclus</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {features.map((f: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-gray-300 text-sm">{typeof f === 'string' ? f : f.label || f.text || JSON.stringify(f)}</span>
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
                <Target className="h-8 w-8 text-primary mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl font-bold">{portfolio.title || 'Nos Réalisations'}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {portfolio.items.map((item: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                    {item.image && <img src={item.image} alt={item.title || ''} className="w-full h-48 object-cover" />}
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
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">{guarantee.title || 'Garantie de remboursement à 100%'}</h2>
                <p className="text-gray-400 text-lg leading-relaxed max-w-xl mx-auto">{guarantee.description || 'Aucun risque pour vous. Tout le risque est sur nous.'}</p>
                <Button size="lg" onClick={scrollToBooking} className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-10">
                  {ctaText}
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {testimonials.length > 0 && (
        <section className="py-20 px-4 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Ce que disent nos clients</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {testimonials.map((t: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
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

      {/* ─── FAQ (Hormozi) ─── */}
      {faq && Array.isArray(faq.items) && faq.items.length > 0 && (
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">{faq.title || 'Questions fréquentes'}</h2>
              <div className="space-y-3">
                {faq.items.map((q: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                    className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="font-semibold text-white mb-2">{q.question}</p>
                    <p className="text-gray-400 leading-relaxed">{q.answer}</p>
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
              <CalendarCheck className="h-10 w-10 text-primary mx-auto mb-4" />
              <h2 className="text-3xl sm:text-4xl font-bold">{ctaText}</h2>
              <p className="text-gray-400 mt-3">Pour un devis sans engagement</p>
            </div>
            <BookingSection
              offerId={offer.id}
              ownerId={offer.owner_id}
              offerName={offer.name}
              ctaText={ctaText}
            />
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
