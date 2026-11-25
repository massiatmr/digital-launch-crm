export type SopMessage = { key: string; label: string; when: string; body: string; enabled: boolean };
export type SopConfig = {
  assistant_label: string;
  company_label: string;
  consultant_name: string;
  visio_link: string;
  vsl_link: string;
  speed_green_min: number;
  speed_red_min: number;
  messages: SopMessage[];
};

export const DEFAULT_SOP: SopConfig = {
  assistant_label: '',
  company_label: '',
  consultant_name: '',
  visio_link: '',
  vsl_link: '',
  speed_green_min: 10,
  speed_red_min: 15,
  messages: [
    { key: 'A', label: 'A · Sans réponse', when: 'Il ne décroche pas', enabled: true,
      body: "Salam {Prénom}, c'est {Assistante} de {Entreprise}. Vous avez fait une demande sur notre publicité.\n\nJ'aimerais confirmer un détail avec vous. Je vous recontacterai un peu plus tard, ou répondez-moi ici dès que vous avez un moment. Bonne journée." },
    { key: 'B', label: 'B · Confirmation RDV', when: 'Juste après le booking', enabled: true,
      body: "Salam {Prénom}, c'est {Assistante} de {Entreprise}. Comme convenu, votre rendez-vous avec {Consultant} est confirmé : {Jour} {Date} à {Heure}, en visio.\n\nLien de la visio : {Lien visio}\n\nAvant le rendez-vous, voici une vidéo à regarder : {Lien VSL}. Elle présente notre façon de travailler.\n\nMerci de me confirmer en répondant \"OK\"." },
    { key: 'C', label: 'C · Rappel du matin', when: 'Matin du rendez-vous', enabled: true,
      body: "Salam {Prénom}, petit rappel : votre rendez-vous avec nous a lieu aujourd'hui à {Heure}.\n\nLien de la visio : {Lien visio}\n\nSi vous n'avez pas encore vu la vidéo qui explique notre process, la voici : {Lien VSL}" },
    { key: 'D', label: 'D · Absent au RDV', when: 'Jour du RDV manqué', enabled: true,
      body: "Salam {Prénom}, vous aviez réservé un rendez-vous avec nous.\n\nJe suis disponible un moment aujourd'hui, voici mon numéro : {Numéro}. On peut reprogrammer le rendez-vous quand cela vous arrange." },
    { key: 'E', label: 'E · Relance 3-4 jours', when: '3 à 4 jours sans réponse', enabled: true,
      body: "Salam {Prénom}, j'ai essayé de vous joindre et j'ai laissé quelques messages ces derniers jours, sans retour.\n\nComment souhaitez-vous qu'on procède à partir de là ?\n\nJe suis disponible un petit moment. Si je ne réponds pas directement, laissez-moi un message et je reviens vers vous dès que possible." },
    { key: 'F', label: 'F · Intéressé, pas clair', when: 'Seulement si l\'offre est validée', enabled: true,
      body: "Salam {Prénom}, j'en ai parlé avec {Consultant} à propos de votre échange.\n\nNous avons pu prévoir une meilleure offre pour démarrer, avec quelques bonus.\n\nSi vous êtes toujours intéressé, dites-le-moi et je cale un rendez-vous." },
    { key: 'G', label: 'G · Relance 10 jours', when: '10 jours sans réponse', enabled: true,
      body: "Salam {Prénom}, on n'a pas eu de retour depuis un moment. Avez-vous laissé tomber l'idée d'avoir plus de clients ?\n\nOu qu'est-ce qui s'est passé ?" },
    { key: 'H', label: 'H · Message final', when: '15 jours sans réponse, puis clôture', enabled: true,
      body: "Salut {Prénom}, j'espère que vous allez bien. Je n'ai pas eu de retour de votre part depuis un moment. Je voulais savoir si ce n'est plus d'actualité, ou si ce n'est peut-être pas le moment.\n\nPour confirmer avant de clôturer le dossier, tenez-moi au courant.\n\nBonne journée." },
  ],
};

export function resolveSop(raw: any): SopConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_SOP,
    ...r,
    messages: Array.isArray(r.messages) && r.messages.length ? r.messages : DEFAULT_SOP.messages,
  };
}

export type SopVars = Record<string, string | undefined | null>;

/** Replace {Champ} placeholders (case/accents-insensitive). Unknown or empty fields are left visible so the assistant notices them. */
export function renderSop(body: string, vars: SopVars): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) if (v) map.set(norm(k), v);
  return body.replace(/\{([^{}]+)\}/g, (m, k) => map.get(norm(k)) ?? m);
}

export const SOP_FIELDS = ['{Prénom}', '{Assistante}', '{Numéro}', '{Entreprise}', '{Consultant}', '{Jour}', '{Date}', '{Heure}', '{Lien visio}', '{Lien VSL}', '{Offre}'];

/** Speed-to-lead color for a lead still waiting for its first contact. */
export function speedLevel(minutesWaiting: number, cfg: Pick<SopConfig, 'speed_green_min' | 'speed_red_min'>): 'green' | 'orange' | 'red' {
  if (minutesWaiting < cfg.speed_green_min) return 'green';
  if (minutesWaiting < cfg.speed_red_min) return 'orange';
  return 'red';
}
