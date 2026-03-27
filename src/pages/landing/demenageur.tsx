import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import BookingSection from '@/components/BookingSection';
import {
  ArrowRight, Shield, AlertCircle, Check, Star, Truck,
  Globe, Calculator, BarChart3, Users, Smartphone, ChevronDown,
  Monitor, Palette, Megaphone, Database
} from 'lucide-react';
import type { DbOffer } from '@/hooks/useOfferData';

import portfolioParis from '@/assets/portfolio-demenagement-paris.png';
import portfolioAmydem from '@/assets/portfolio-amydem.png';
import portfolioStrategie from '@/assets/portfolio-strategie.png';
import portfolioCalculateur from '@/assets/portfolio-calculateur.png';

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

const painPoints = [
  "Vous en avez marre que votre site internet n'apporte aucun résultat…",
  "Vous vous demandez quand le «SEO» commencera à fonctionner…",
  "Vous avez déjà versé des milliers d'euros à une agence — sans aucun bon résultat…",
  "Vous voulez un site Web décent mais vous ne savez pas à qui vous pouvez faire confiance…",
];

const solutions = [
  "Je reste réaliste, sans fausses attentes.",
  "J'ai une vraie expérience, avec de vrais résultats.",
  "Je suis le plus abordable à mon niveau.",
  "Mon travail est de grande qualité.",
];

const features = [
  { icon: Globe, title: "Site Web Pro", desc: "Design sur mesure qui inspire confiance aux propriétaires" },
  { icon: Calculator, title: "Calculateur de Devis", desc: "Estimations instantanées pour vos prospects, personnalisé à votre marque" },
  { icon: Database, title: "CRM Complet", desc: "Gérez vos leads, suivez vos relances et ne perdez plus aucun client" },
  { icon: BarChart3, title: "Génération de Leads", desc: "Stratégie Meta Ads + SEO pour un flux constant de demandes" },
  { icon: Palette, title: "Identité Visuelle", desc: "Logo, charte graphique et branding professionnel" },
  { icon: Smartphone, title: "100% Responsive", desc: "Parfaitement adapté sur mobile, tablette et ordinateur" },
];

const portfolio = [
  { image: portfolioParis, title: "Déménagement Paris", desc: "Nouveau Logo — Site Web — Calculateur de devis" },
  { image: portfolioAmydem, title: "AMYDEM Transports", desc: "Site Web et Calculateur de devis" },
  { image: portfolioStrategie, title: "Stratégie Complète", desc: "Guide de stratégie web pour déménageurs — structuré et clé en main" },
  { image: portfolioCalculateur, title: "Calculateur de Devis", desc: "Outil interactif multi-étapes pour estimation instantanée" },
];

interface Props {
  offer: DbOffer;
}

export default function DemenageurLanding({ offer }: Props) {
  const scrollToBooking = () => document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* ─── Sticky Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <Truck className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Digital Launch</span>
          </div>
          <Button
            size="sm"
            onClick={scrollToBooking}
            className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 shadow-lg shadow-red-600/20"
          >
            Réserver un Appel
          </Button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-28 pb-24 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-red-600/8 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-72 h-72 bg-orange-500/5 rounded-full blur-[100px] pointer-events-none" />

        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.7 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-red-600/10 border border-red-500/20 text-red-400 text-sm font-medium"
          >
            <Truck className="h-4 w-4" />
            Spécialiste Sites Web pour Déménageurs
          </motion.div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
            Je conçois les sites Web{' '}
            <br className="hidden sm:block" />
            des Déménageurs les plus{' '}
            <span className="text-red-500">FIABLES</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Plus de <span className="text-white font-semibold">Leads</span> et{' '}
            <span className="text-white font-semibold">Devis</span> pour votre société.{' '}
            Qui gagnent la <span className="text-red-400 font-semibold">CONFIANCE</span> des propriétaires.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-gray-500 text-sm">
            <span>Pour générer de meilleurs leads…</span>
            <span className="hidden sm:inline">•</span>
            <span>Prendre plus de rendez-vous…</span>
            <span className="hidden sm:inline">•</span>
            <span>Et faire plus de déménagements…</span>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              onClick={scrollToBooking}
              className="bg-red-600 hover:bg-red-500 text-white rounded-full px-12 py-7 text-lg font-bold shadow-xl shadow-red-600/30 transition-all hover:shadow-red-600/40 hover:scale-[1.02]"
            >
              Réserver un Appel <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <span className="text-sm text-gray-500">Pour un devis sans engagement</span>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">Garantie remboursement 100%</span>
            </div>
          </div>
        </motion.div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-6 w-6 text-gray-600" />
        </div>
      </section>

      {/* ─── Portfolio / Réalisations ─── */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold">Nos Réalisations</h2>
              <p className="text-gray-400 mt-3">Des résultats concrets pour des déménageurs comme vous</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {portfolio.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] hover:border-red-500/20 transition-all duration-300"
                >
                  <div className="overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-56 object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-5">
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Pain Points ─── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              Est-ce que cela vous ressemble ?
            </h2>
            <p className="text-gray-500 text-center mb-12">Si vous vous reconnaissez, continuez à lire…</p>
            <div className="space-y-4">
              {painPoints.map((item, i) => (
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

      {/* ─── Solution ─── */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-red-600/[0.03] to-transparent">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5 }}>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Et bien c'est votre jour de chance !
              </h2>
              <p className="text-gray-400 mt-4 text-lg">Parce que…</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {solutions.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-3 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <Check className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-gray-300 font-medium">{item}</span>
                </motion.div>
              ))}
            </div>
            <div className="text-center mt-10">
              <p className="text-2xl font-bold text-white">Et le TOP c'est quoi ?!</p>
              <p className="text-gray-400 mt-3 text-lg max-w-xl mx-auto">
                Je suis la <span className="text-red-400 font-bold">SEULE</span> personne dans le domaine des déménageurs
                à offrir une <span className="text-emerald-400 font-bold">Garantie de remboursement à 100%</span>.
              </p>
              <p className="text-white font-semibold mt-4">
                Aucun risque pour vous. Tout le risque est sur moi.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Le Système Complet ─── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Le Système <span className="text-red-500">Complet</span> pour Développer
                <br className="hidden sm:block" /> votre Société de Déménagement
              </h2>
              <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
                Pas juste un site web. Un écosystème complet de génération de leads, de gestion clients et de croissance.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-red-500/20 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-red-600/10 flex items-center justify-center mb-4 group-hover:bg-red-600/20 transition-colors">
                    <f.icon className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Guarantee ─── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/[0.04] p-8 sm:p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent pointer-events-none" />
              <div className="relative">
                <Shield className="h-16 w-16 text-emerald-400 mx-auto mb-6" />
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Garantie de remboursement à 100%
                </h2>
                <p className="text-gray-400 text-lg leading-relaxed max-w-xl mx-auto">
                  J'ai tellement confiance en mes capacités et en la qualité de mon travail
                  que j'offre une garantie de remboursement à 100% sur tout mon travail,
                  sans poser de questions.
                </p>
                <Button
                  size="lg"
                  onClick={scrollToBooking}
                  className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-10 py-6 text-lg font-semibold shadow-lg shadow-emerald-600/20"
                >
                  Réserver un Appel
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA intermédiaire ─── */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Êtes-vous prêt à devenir{' '}
              <span className="text-red-500">UN ROI</span> du Déménagement ?
            </h2>
            <p className="text-gray-400 mb-8 text-lg">
              On offre le Calculateur de Devis pour faciliter la tâche pour vous et vos Prospects.
              <br />Customisable à votre Marque et site Web.
            </p>
            <Button
              size="lg"
              onClick={scrollToBooking}
              className="bg-red-600 hover:bg-red-500 text-white rounded-full px-12 py-7 text-lg font-bold shadow-xl shadow-red-600/30"
            >
              Contactez Nous pour un devis <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Booking ─── */}
      <section id="booking-section" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold">Réserver un Appel</h2>
              <p className="text-gray-400 mt-3">Pour un devis sans engagement</p>
            </div>
            <BookingSection
              offerId={offer.id}
              ownerId={offer.owner_id}
              offerName={offer.name}
              ctaText="Réserver un Appel"
              accentColor="red"
            />
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.06] py-10 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-gray-600">
          <p>© {new Date().getFullYear()} Digital Launch. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
