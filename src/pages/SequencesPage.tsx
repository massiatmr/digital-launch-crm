import { Zap, Loader2, Plus, Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function SequencesPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Séquences de relance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatisez vos relances avec des séquences multi-étapes
        </p>
      </motion.div>

      <motion.div variants={item} className="glass-card p-8 flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary mb-4">
          <Zap className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Séquences automatiques</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Créez des templates de relance automatique : J+1 WhatsApp, J+3 Email, J+7 Appel.
          L'IA génère le contenu de chaque étape adapté au profil du lead.
        </p>
        <p className="text-xs text-muted-foreground italic">
          Fonctionnalité bientôt disponible — Les tables de données sont en cours de configuration.
        </p>
      </motion.div>

      {/* Example templates preview */}
      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: 'Relance standard', steps: 3, desc: 'J+1 WhatsApp → J+3 Email → J+7 Appel' },
          { name: 'Lead froid', steps: 4, desc: 'J+1 Email valeur → J+4 Contenu → J+7 Offre → J+14 Appel' },
          { name: 'Post-devis', steps: 2, desc: 'J+2 Email suivi → J+5 Appel closing' },
        ].map((seq) => (
          <div key={seq.name} className="glass-card-hover p-5 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{seq.name}</h3>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                {seq.steps} étapes
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{seq.desc}</p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
