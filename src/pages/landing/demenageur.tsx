import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import BookingSection from '@/components/BookingSection';
import {
  ArrowRight, Shield, AlertCircle, Check, Truck,
  Globe, Calculator, BarChart3, Smartphone, ChevronDown,
  Palette, Database, Users, MessageSquare, TrendingUp,
  Target, Zap, Award, Clock, CheckCircle2, Gift,
} from 'lucide-react';
import type { DbOffer } from '@/hooks/useOfferData';
import { useOfferPage } from '@/hooks/useOfferData';
import { type OfferBranding, HormoziIcon } from '@/pages/PublicOfferPage';
import { getVisibleOfferItems, sanitizeOfferSections } from '@/lib/offerContent';
import { buildBrandCssVars } from '@/lib/brandColor';

import portfolioParis from '@/assets/portfolio-demenagement-paris.png';
import portfolioAmydem from '@/assets/portfolio-amydem.png';
import portfolioStrategie from '@/assets/portfolio-strategie.png';
import portfolioCalculateur from '@/assets/portfolio-calculateur.png';
import logoDigitalLaunch from '@/assets/digital-launch-logo.png';
import heroMovers from '@/assets/hero-movers.jpg';
import moversSectionBg from '@/assets/movers-section-bg.jpg';

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };
const fadeLeft = { hidden: { opacity: 0, x: -40 }, visible: { opacity: 1, x: 0 } };
const fadeRight = { hidden: { opacity: 0, x: 40 }, visible: { opacity: 1, x: 0 } };

// Fallback content used only if the user hasn't configured the section in the Studio.
const FALLBACK_PAIN_POINTS = [
  { icon: 'Globe', title: '', description: "Vous en avez marre que votre site internet n'apporte aucun résultat…" },
  { icon: 'TrendingUp', title: '', description: "Vous vous demandez quand le «SEO» commencera à fonctionner…" },
  { icon: 'Target', title: '', description: "Vous avez déjà versé des milliers d'euros à une agence — sans aucun bon résultat…" },
  { icon: 'Shield', title: '', description: "Vous voulez un site Web décent mais vous ne savez pas à qui vous pouvez faire confiance…" },
];

const FALLBACK_SOLUTIONS = [
  "Je reste réaliste, sans fausses attentes.",
  "J'ai une vraie expérience, avec de vrais résultats.",
  "Je suis le plus abordable à mon niveau.",
  "Mon travail est de grande qualité.",
];

interface Props {
  offer: DbOffer;
  branding?: OfferBranding | null;
}

export default function DemenageurLanding({ offer, branding }: Props) {
  const { data: offerPage } = useOfferPage(offer.id);

  const scrollToBooking = () => document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
  const workspaceLogo = branding?.logo_url_light || branding?.logo_url;
  const headerLogo = workspaceLogo || logoDigitalLaunch;
  const brandName = branding?.company_name || 'Digital Launch';
  const showBrandText = !workspaceLogo;

  // ─── Read sections from Studio ───
  const allSections = Array.isArray(offerPage?.sections) ? offerPage!.sections : [];
  const sections = sanitizeOfferSections((allSections as any[]).filter((s) => !s?.hidden));
  const findSection = (type: string) => sections.find((s) => s.type === type);

  const heroHeadline = offerPage?.headline?.trim();
  const heroSub = offerPage?.subheadline?.trim();
  const ctaText = offerPage?.cta_text?.trim() || 'Réserver un Appel';

  const painPointsSection = findSection('pain_points');
  const cleanPainItems = getVisibleOfferItems(painPointsSection);
  const painItems: any[] =
    cleanPainItems.length > 0
      ? cleanPainItems
      : FALLBACK_PAIN_POINTS;
  const painTitle = painPointsSection?.title || 'Est-ce que cela vous ressemble ?';

  const solutionSection = findSection('solution');
  const cleanSolutionItems = getVisibleOfferItems(solutionSection);
  const solutionItems: string[] =
    cleanSolutionItems.length > 0
      ? cleanSolutionItems.map((it: any) => (typeof it === 'string' ? it : it?.title || it?.description || '')).filter(Boolean)
      : FALLBACK_SOLUTIONS;
  const solutionTitle = solutionSection?.title || "Et bien c'est votre jour de chance !";

  const transformation = findSection('transformation');
  const deliverables = findSection('deliverables');
  const bonuses = findSection('bonuses');
  const guarantee = findSection('guarantee');
  const faq = findSection('faq');
  const showPrice = (offer as any).show_price === true;
  const pricing = showPrice ? findSection('pricing') : null;

  // Brand color drives the entire accent palette of the landing.
  // Fallback to the historical red (#dc2626) so the design stays identical
  // when no brand color is set on the workspace.
  const brandStyle = buildBrandCssVars(branding?.brand_color || '#dc2626') as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden" style={brandStyle}>
      {/* ─── Sticky Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={headerLogo} alt={brandName} className="h-9 w-auto max-h-9 max-w-[200px] object-contain" />
            {showBrandText && (
              <span className="font-bold text-lg tracking-tight truncate">{brandName}</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={scrollToBooking}
            className="bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-full px-6 shadow-lg shadow-[var(--brand-glow)]"
          >
            {ctaText}
          </Button>
        </div>
      </nav>

      {/* ─── Hero with background image ─── */}
      <section className="relative pt-16 min-h-[90vh] flex items-center">
        <div className="absolute inset-0">
          <img src={heroMovers} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/85 to-[#0a0a0f]/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/40" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" animate="visible" variants={fadeLeft} transition={{ duration: 0.7 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-[var(--brand-soft)] border border-[var(--brand-border)] text-[var(--brand-light)] text-sm font-medium"
            >
              <Truck className="h-4 w-4" />
              {offer.niche || 'Spécialiste Sites Web pour Déménageurs'}
            </motion.div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
              {heroHeadline || (
                <>Je conçois les sites Web des Déménageurs les plus <span className="text-[var(--brand)]">FIABLES</span></>
              )}
            </h1>

            {heroSub ? (
              <p className="mt-6 text-lg text-gray-300 leading-relaxed max-w-lg">{heroSub}</p>
            ) : (
              <p className="mt-6 text-lg text-gray-300 leading-relaxed max-w-lg">
                Plus de <span className="text-white font-semibold">Leads</span> et{' '}
                <span className="text-white font-semibold">Devis</span> pour votre société.{' '}
                Qui gagnent la <span className="text-[var(--brand-light)] font-semibold">CONFIANCE</span> des propriétaires.
              </p>
            )}

            {!heroSub && (
              <div className="mt-5 flex flex-col gap-2 text-gray-400 text-sm">
                {["Pour générer de meilleurs leads…", "Prendre plus de rendez-vous…", "Et faire plus de déménagements…"].map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.15 }} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--brand)] shrink-0" />
                    <span>{t}</span>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
              <Button
                size="lg"
                onClick={scrollToBooking}
                className="bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-full px-10 py-7 text-lg font-bold shadow-xl shadow-[var(--brand-glow)] transition-all hover:shadow-[var(--brand-glow)] hover:scale-[1.02]"
              >
                {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <span className="text-sm text-gray-500 mt-3 sm:mt-4">Pour un devis sans engagement</span>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">Garantie remboursement 100%</span>
            </div>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeRight} transition={{ duration: 0.7, delay: 0.3 }} className="hidden lg:block">
            <div className="relative">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50 rotate-1 hover:rotate-0 transition-transform duration-500">
                <img src={portfolioParis} alt="Déménagement Paris" className="w-full" />
              </div>
              <div className="absolute -bottom-6 -left-6 rounded-xl overflow-hidden border border-white/10 shadow-xl w-48 -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src={portfolioAmydem} alt="AMYDEM" className="w-full" />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-6 w-6 text-gray-500" />
        </div>
      </section>

      {/* ─── Pain Points (data-driven) ─── */}
      {painItems.length > 0 && (
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-center mb-4">{painTitle}</h2>
              <p className="text-gray-500 text-center mb-14 text-lg">Si vous vous reconnaissez, continuez à lire…</p>
              <div className="space-y-4">
                {painItems.map((item: any, i: number) => {
                  const isObj = item && typeof item === 'object';
                  const iconName = isObj ? (item.icon || 'AlertCircle') : 'AlertCircle';
                  const title = isObj ? item.title : null;
                  const desc = isObj ? item.description : (typeof item === 'string' ? item : '');
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-5 p-6 rounded-2xl bg-gradient-to-r from-white/[0.03] to-transparent border border-white/[0.06] hover:border-[var(--brand-border-strong)] transition-all duration-300 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[var(--brand-softer)] flex items-center justify-center shrink-0 group-hover:bg-[var(--brand-soft)] transition-colors">
                        <HormoziIcon name={iconName} className="h-5 w-5 text-[var(--brand-light)]" />
                      </div>
                      <div className="flex-1">
                        {title && <p className="font-bold text-white text-lg mb-1">{title}</p>}
                        {desc && <p className="text-gray-200 leading-relaxed text-lg">{desc}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Transformation Before/After (if configured) ─── */}
      {transformation && (transformation.before || transformation.after) && (
        <section className="py-24 px-4 bg-gradient-to-b from-transparent via-[var(--brand-softer)] to-transparent">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-center mb-12">
                {transformation.title || 'La transformation'}
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-8 rounded-2xl bg-[var(--brand-deep)] border border-[var(--brand-deep-border)]">
                  <p className="text-xs font-bold text-[var(--brand-light)] mb-3 tracking-wider">AVANT</p>
                  <p className="text-gray-200 leading-relaxed text-lg whitespace-pre-line">{transformation.before}</p>
                </div>
                <div className="p-8 rounded-2xl bg-emerald-950/20 border border-emerald-900/30">
                  <p className="text-xs font-bold text-emerald-400 mb-3 tracking-wider">APRÈS</p>
                  <p className="text-gray-200 leading-relaxed text-lg whitespace-pre-line">{transformation.after}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Solution ─── */}
      <section className="py-24 px-4 relative">
        <div className="absolute inset-0">
          <img src={moversSectionBg} alt="" className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-[#0a0a0f]/92" />
        </div>
        <div className="max-w-4xl mx-auto relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
            <div className="text-center mb-12">
              <motion.div
                initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
                className="w-16 h-16 rounded-2xl bg-emerald-600/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <Award className="h-8 w-8 text-emerald-400" />
              </motion.div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black">{solutionTitle}</h2>
              {solutionSection?.description && (
                <p className="mt-4 text-gray-300 text-lg max-w-2xl mx-auto">{solutionSection.description}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {solutionItems.map((item: string, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-3 p-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm"
                >
                  <Check className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-gray-200 font-medium text-lg">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Deliverables (data-driven) ─── */}
      {deliverables && getVisibleOfferItems(deliverables).length > 0 && (
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-14">
                <div className="w-14 h-14 rounded-2xl bg-[var(--brand-softer)] border border-[var(--brand-border)] flex items-center justify-center mx-auto mb-5">
                  <Zap className="h-7 w-7 text-[var(--brand-light)]" />
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black">
                  {deliverables.title || 'Tout ce que vous obtenez'}
                </h2>
              </div>
              <div className="space-y-4">
                {getVisibleOfferItems(deliverables).map((d: any, i: number) => {
                  const isObj = d && typeof d === 'object';
                  const iconName = isObj ? (d.icon || 'Check') : 'Check';
                  const title = isObj ? d.title : (typeof d === 'string' ? d : '');
                  const desc = isObj ? d.description : '';
                  const value = isObj ? d.value : '';
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-[var(--brand-border)] transition-colors"
                    >
                      <div className="w-11 h-11 rounded-xl bg-[var(--brand-softer)] flex items-center justify-center shrink-0">
                        <HormoziIcon name={iconName} className="h-5 w-5 text-[var(--brand-light)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          {title && <p className="font-bold text-white text-lg">{title}</p>}
                          {value && <span className="text-sm font-bold text-emerald-400 shrink-0 mt-1">{value}</span>}
                        </div>
                        {desc && <p className="text-gray-400 text-sm mt-1 leading-relaxed">{desc}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {deliverables.total_value > 0 && (
                <p className="text-center mt-10 text-gray-400 text-lg">
                  Valeur totale : <span className="text-3xl font-black text-white ml-2">{deliverables.total_value}€</span>
                </p>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Portfolio vitrine Digital Launch (toujours présent) ─── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black">
                Le Système <span className="text-[var(--brand)]">Complet</span> pour Développer
                <br className="hidden sm:block" /> votre Société de Déménagement
              </h2>
              <p className="text-gray-400 mt-4 text-lg max-w-2xl mx-auto">
                Pas juste un site web. Un écosystème complet pour faire passer votre entreprise au niveau supérieur.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-24">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeLeft} transition={{ duration: 0.6 }}>
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img src={portfolioParis} alt="Site Déménagement Paris" className="w-full" loading="lazy" />
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeRight} transition={{ duration: 0.6 }}>
              <div className="w-14 h-14 rounded-2xl bg-[var(--brand-softer)] flex items-center justify-center mb-5">
                <Globe className="h-7 w-7 text-[var(--brand-light)]" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">Site Web Professionnel</h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                Un design sur mesure qui inspire <span className="text-white font-semibold">confiance</span> aux propriétaires.
                Optimisé pour convertir les visiteurs en demandes de devis.
              </p>
              <ul className="space-y-3">
                {["Design moderne adapté à votre marque", "Optimisé SEO pour Google", "Formulaire de contact intégré", "100% responsive mobile"].map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-24">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeLeft} transition={{ duration: 0.6 }} className="order-2 lg:order-1">
              <div className="w-14 h-14 rounded-2xl bg-orange-600/10 flex items-center justify-center mb-5">
                <Calculator className="h-7 w-7 text-orange-400" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">Calculateur de Devis Interactif</h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                Vos prospects obtiennent une estimation instantanée — et vous recevez un lead qualifié.
              </p>
              <ul className="space-y-3">
                {["Estimation multi-étapes", "Personnalisé à vos tarifs", "Capture des coordonnées", "Intégré à votre site"].map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300">
                    <Check className="h-4 w-4 text-orange-400 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeRight} transition={{ duration: 0.6 }} className="order-1 lg:order-2">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img src={portfolioCalculateur} alt="Calculateur de Devis" className="w-full" loading="lazy" />
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-24">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeLeft} transition={{ duration: 0.6 }}>
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-br from-[#12121a] to-[#0a0a12] p-8">
                <div className="space-y-4">
                  {[
                    { name: "Jean Durand", status: "Qualifié", score: "🔥 Hot", date: "Aujourd'hui" },
                    { name: "Marie Lambert", status: "Contacté", score: "⚡ Warm", date: "Hier" },
                    { name: "Pierre Martin", status: "Nouveau", score: "🔥 Hot", date: "Il y a 2h" },
                  ].map((lead, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] flex items-center justify-center text-sm font-bold text-[var(--brand-light)]">
                          {lead.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{lead.name}</p>
                          <p className="text-xs text-gray-500">{lead.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-white/[0.06] text-gray-400">{lead.status}</span>
                        <span className="text-xs">{lead.score}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeRight} transition={{ duration: 0.6 }}>
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-5">
                <Database className="h-7 w-7 text-blue-400" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">CRM Complet Intégré</h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                Gérez tous vos leads au même endroit. Suivez vos relances, planifiez vos appels.
              </p>
              <ul className="space-y-3">
                {["Suivi de chaque prospect", "Rappels automatiques", "Historique des interactions", "Pipeline visuel"].map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300">
                    <Check className="h-4 w-4 text-blue-400 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-24">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeLeft} transition={{ duration: 0.6 }} className="order-2 lg:order-1">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/10 flex items-center justify-center mb-5">
                <Palette className="h-7 w-7 text-purple-400" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">Identité Visuelle & Stratégie</h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                Logo, charte graphique, positionnement — tout pour vous démarquer.
              </p>
              <ul className="space-y-3">
                {["Logo professionnel", "Charte graphique", "Stratégie de contenu", "Positionnement de marque"].map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300">
                    <Check className="h-4 w-4 text-purple-400 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeRight} transition={{ duration: 0.6 }} className="order-1 lg:order-2">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img src={portfolioStrategie} alt="Stratégie Web Déménagement" className="w-full" loading="lazy" />
              </div>
            </motion.div>
          </div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: BarChart3, title: "Génération de Leads", desc: "Stratégie Meta Ads + SEO pour un flux constant de demandes qualifiées", color: "text-green-400", bg: "bg-green-600/10" },
              { icon: Smartphone, title: "100% Responsive", desc: "Parfaitement adapté sur mobile, tablette et ordinateur", color: "text-cyan-400", bg: "bg-cyan-600/10" },
              { icon: MessageSquare, title: "Scripts de Vente", desc: "Scripts d'appel optimisés avec gestion des objections", color: "text-amber-400", bg: "bg-amber-600/10" },
              { icon: Clock, title: "Support Réactif", desc: "Assistance rapide et personnalisée", color: "text-pink-400", bg: "bg-pink-600/10" },
              { icon: Users, title: "Formation Incluse", desc: "On vous forme à utiliser tous les outils", color: "text-indigo-400", bg: "bg-indigo-600/10" },
              { icon: Zap, title: "Résultats Rapides", desc: "Première version livrée en quelques jours", color: "text-yellow-400", bg: "bg-yellow-600/10" },
            ].map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`h-6 w-6 ${f.color}`} />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Bonuses (data-driven) ─── */}
      {bonuses && getVisibleOfferItems(bonuses).length > 0 && (
        <section className="py-24 px-4 bg-gradient-to-b from-transparent via-yellow-500/[0.04] to-transparent">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <div className="text-center mb-12">
                <Gift className="h-10 w-10 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black">{bonuses.title || 'Bonus exclusifs'}</h2>
              </div>
              <div className="space-y-4">
                {getVisibleOfferItems(bonuses).map((b: any, i: number) => {
                  const isObj = b && typeof b === 'object';
                  const title = isObj ? b.title : (typeof b === 'string' ? b : '');
                  const desc = isObj ? b.description : '';
                  const value = isObj ? b.value : '';
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                      className="p-6 rounded-2xl bg-yellow-500/[0.05] border border-yellow-500/20">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold text-white text-lg">🎁 {title}</p>
                        {value && <span className="text-sm font-bold text-yellow-400 shrink-0 mt-1">{value}</span>}
                      </div>
                      {desc && <p className="text-gray-300 text-sm mt-2 leading-relaxed">{desc}</p>}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Pricing (data-driven, only if show_price) ─── */}
      {pricing && (pricing.final || pricing.anchor) && (
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <p className="text-sm text-gray-500 uppercase tracking-wider mb-3">{pricing.title || 'Investissement'}</p>
              {pricing.anchor && <p className="text-2xl text-gray-500 line-through mb-2">{pricing.anchor}</p>}
              {pricing.final && <p className="text-6xl sm:text-7xl font-black text-[var(--brand)]">{pricing.final}</p>}
              <Button size="lg" onClick={scrollToBooking}
                className="mt-8 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-full px-12 py-7 text-lg font-bold shadow-xl shadow-[var(--brand-glow)]">
                {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Guarantee ─── */}
      <section className="py-24 px-4 relative">
        <div className="absolute inset-0">
          <img src={heroMovers} alt="" className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-[#0a0a0f]/95" />
        </div>
        <div className="max-w-3xl mx-auto relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="rounded-3xl border-2 border-emerald-500/20 bg-emerald-500/[0.04] p-8 sm:p-14 text-center relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600" />
              <Shield className="h-20 w-20 text-emerald-400 mx-auto mb-6" />
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-6">
                {guarantee?.title || 'Garantie de remboursement à 100%'}
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed max-w-xl mx-auto whitespace-pre-line">
                {guarantee?.description ||
                  "J'ai tellement confiance en mes capacités et en la qualité de mon travail que j'offre une garantie de remboursement à 100% sur tout mon travail, sans poser de questions."}
              </p>
              <Button
                size="lg"
                onClick={scrollToBooking}
                className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-12 py-7 text-lg font-bold shadow-xl shadow-emerald-600/25"
              >
                {ctaText}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ (data-driven, if configured) ─── */}
      {faq && getVisibleOfferItems(faq).length > 0 && (
        <section className="py-24 px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-center mb-12">
                {faq.title || 'Questions fréquentes'}
              </h2>
              <div className="space-y-4">
                {getVisibleOfferItems(faq).map((q: any, i: number) => {
                  const isObj = q && typeof q === 'object';
                  const question = isObj ? (q.question || q.title) : (typeof q === 'string' ? q : '');
                  const answer = isObj ? (q.answer || q.description) : '';
                  return (
                    <div key={i} className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                      {question && <p className="font-bold text-white text-lg mb-2">{question}</p>}
                      {answer && <p className="text-gray-300 leading-relaxed whitespace-pre-line">{answer}</p>}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── CTA ROI ─── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-6">
              Êtes-vous prêt à devenir{' '}
              <span className="text-[var(--brand)]">UN ROI</span>
              <br /> du Déménagement ?
            </h2>
            <p className="text-gray-400 mb-10 text-lg max-w-xl mx-auto">
              Rejoignez les déménageurs qui ont choisi de se professionnaliser et de dominer leur marché local.
            </p>
            <Button
              size="lg"
              onClick={scrollToBooking}
              className="bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-full px-12 py-7 text-lg font-bold shadow-xl shadow-[var(--brand-glow)] hover:scale-[1.02] transition-all"
            >
              {ctaText} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Booking ─── */}
      <section id="booking-section" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black">{ctaText}</h2>
              <p className="text-gray-400 mt-3 text-lg">Pour un devis sans engagement</p>
            </div>
            <BookingSection
              offerId={offer.id}
              ownerId={offer.owner_id}
              offerName={offer.name}
              ctaText={ctaText}
              accentColor="red"
            />
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.06] py-10 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={headerLogo} alt={brandName} className="h-6 w-auto max-h-6 max-w-[120px] object-contain" loading="lazy" />
            <span className="font-semibold text-sm text-gray-400">{brandName}</span>
          </div>
          <p className="text-sm text-gray-600">© {new Date().getFullYear()} Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
