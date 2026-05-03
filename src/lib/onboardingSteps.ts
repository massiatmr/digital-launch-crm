export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'radio'
  | 'checkbox-multi'
  | 'file-or-link'
  | 'select';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  optional?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface FormStep {
  title: string;
  description?: string;
  skipCheckbox?: string;
  fields: FormField[];
}

// ============== SITE WEB ==============
// Doublons supprimés pour alléger l'expérience client :
// - "main_offer" (≈ main_service)
// - "expected_result" (≈ main_goal)
// - "why_choose" (≈ main_advantage)
export const WEBSITE_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    description:
      "Nous avons besoin de ces informations pour créer votre fiche client et vous contacter facilement.",
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text', hint: "Nom officiel de votre entreprise ou nom commercial utilisé par vos clients." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Adresse email professionnelle (pas votre email personnel)." },
      { id: 'company_phone', label: "Téléphone de l'entreprise", type: 'tel', hint: "Numéro principal que vos clients utilisent pour vous joindre." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp pro pour recevoir les demandes et leads." },
      { id: 'current_website', label: 'Site web actuel', type: 'text', optional: true, placeholder: 'https://monsite.com', hint: "Si vous avez déjà un site, indiquez l'adresse complète. Sinon, laissez vide." },
    ],
  },
  {
    title: 'Objectif du site',
    description: "Cela nous permet de comprendre ce que vous attendez de votre site et de construire quelque chose d'adapté.",
    fields: [
      { id: 'site_type', label: 'Type de site', type: 'radio', options: ['Landing page', 'Site vitrine', 'E-commerce', 'Autre'], hint: "Une landing page est centrée sur une action, un site vitrine présente votre entreprise en plusieurs pages." },
      { id: 'main_goal', label: 'Objectif principal', type: 'radio', options: ['Générer des leads', "Présenter l'entreprise", 'Vendre', 'Prise de rendez-vous'], hint: "Que souhaitez-vous que les visiteurs fassent en arrivant sur votre site ?" },
      { id: 'main_service', label: 'Service principal à mettre en avant', type: 'textarea', hint: "Le service ou l'offre phare que le site doit promouvoir en priorité. Ex : déménagement, coaching, plomberie." },
    ],
  },
  {
    title: 'Offre et contenu',
    description: 'Cela nous permet de comprendre votre positionnement et de créer un contenu qui parle à vos clients.',
    fields: [
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez tous vos services, un par ligne. Ex :\n- Déménagement local\n- Longue distance\n- Garde-meuble" },
      { id: 'avg_price', label: 'Prix moyen de vos services', type: 'text', hint: "Fourchette de prix habituelle. Ex : à partir de 500€, entre 1000€ et 5000€." },
      { id: 'main_advantage', label: 'Avantage principal (pourquoi vous choisir)', type: 'textarea', hint: "Ce qui vous différencie de vos concurrents en une phrase. Ex : 15 ans d'expérience, devis 24h, garantie satisfaction." },
      { id: 'testimonials', label: 'Témoignages clients', type: 'textarea', optional: true, hint: "Copiez-collez ici des avis clients (Google, Facebook, etc.)." },
    ],
  },
  {
    title: 'Design',
    description: 'Ces éléments nous aident à créer un design qui reflète votre image de marque.',
    fields: [
      { id: 'logo', label: 'Logo', type: 'file-or-link', hint: "Envoyez votre logo en haute qualité (PNG, SVG ou PDF). Si vous n'en avez pas, précisez-le." },
      { id: 'brand_colors', label: 'Couleurs de la marque', type: 'text', placeholder: 'Ex : bleu foncé, doré, #1E3A5F', hint: "Les couleurs principales de votre marque." },
      { id: 'reference_sites', label: 'Sites de référence', type: 'textarea', optional: true, placeholder: 'https://...', hint: "Des sites web dont vous aimez le design." },
      { id: 'style', label: 'Style souhaité', type: 'radio', options: ['Moderne', 'Premium', 'Minimaliste', 'Corporate', 'Autre'], hint: "Le style visuel général que vous souhaitez." },
    ],
  },
  {
    title: 'Fonctionnalités',
    description: 'Sélectionnez les fonctionnalités dont vous avez besoin sur votre site.',
    fields: [
      { id: 'features', label: 'Fonctionnalités souhaitées', type: 'checkbox-multi', options: ['Formulaire de contact', 'WhatsApp', 'Devis en ligne', 'Réservation', 'Paiement en ligne', 'Blog', 'Autre'], hint: "Cochez toutes les fonctionnalités à intégrer." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès nous permettent de lancer rapidement la mise en place technique.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'hosting_access', label: 'Accès hébergement', type: 'textarea', hint: "Identifiants de connexion à votre hébergeur (OVH, Ionos, Hostinger…). Si vous n'en avez pas, indiquez-le." },
      { id: 'wordpress_access', label: 'Accès CMS / WordPress', type: 'textarea', optional: true, hint: "URL d'admin + identifiants de votre CMS actuel si vous en avez un." },
      { id: 'email_access', label: 'Accès email professionnel', type: 'textarea', optional: true, hint: "Identifiants de votre messagerie pro si vous souhaitez qu'on la configure." },
    ],
  },
  {
    title: 'Ressources',
    description: 'Partagez les fichiers et médias qui seront utilisés pour la création de votre site.',
    fields: [
      { id: 'photos', label: 'Photos', type: 'file-or-link', optional: true, hint: "Photos de vos locaux, équipe, réalisations ou produits." },
      { id: 'videos', label: 'Vidéos', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages, avant/après…" },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, plaquettes, catalogues, etc." },
    ],
  },
];

// ============== ADS ==============
// Doublons supprimés :
// - "main_offer" étape Activité (≈ promoted_offer)
// - "why_choose" étape Offre à promouvoir (≈ main_advantage)
// - "special_offer" (fusionné dans current_promo)
// - "request_type" (≈ main_contact_method)
// - "most_profitable_area" (peu utile à l'onboarding)
export const ADS_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    description: "Nous avons besoin de ces informations pour créer votre fiche client et vous contacter facilement.",
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text', hint: "Nom officiel ou nom commercial." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Adresse email professionnelle (pas perso)." },
      { id: 'company_phone', label: "Téléphone de l'entreprise", type: 'tel', hint: "Numéro principal de contact." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp pro pour recevoir les leads." },
      { id: 'website', label: 'Site web ou landing page', type: 'text', optional: true, placeholder: 'https://monsite.com', hint: "Adresse de votre site ou page d'atterrissage dédiée aux campagnes." },
    ],
  },
  {
    title: 'Activité',
    description: 'Cela nous permet de comprendre votre entreprise et votre positionnement.',
    fields: [
      { id: 'activity_type', label: "Type d'activité", type: 'text', hint: "Votre secteur principal. Ex : déménagement, plomberie, coaching." },
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez tous vos services, un par ligne." },
      { id: 'main_advantage', label: 'Avantage principal (pourquoi vous choisir)', type: 'textarea', hint: "Ce qui vous différencie en une phrase. Ex : intervention 2h, devis gratuit 24h." },
      { id: 'client_guarantee', label: 'Garantie client', type: 'textarea', hint: "Votre promesse client. Ex : satisfait ou remboursé, garantie décennale." },
    ],
  },
  {
    title: 'Offre à promouvoir',
    description: 'Cela nous aide à créer des annonces percutantes et adaptées à votre offre.',
    fields: [
      { id: 'promoted_offer', label: 'Offre principale à promouvoir', type: 'textarea', hint: "L'offre spécifique mise en avant dans vos pubs. Ex : Déménagement à partir de 299€." },
      { id: 'main_message', label: 'Message principal', type: 'textarea', hint: "Le message clé à transmettre à vos futurs clients." },
      { id: 'current_promo', label: 'Promotion ou offre spéciale en cours', type: 'text', optional: true, hint: "Promotion limitée ou bonus. Ex : -15% jusqu'au 30 juin, devis gratuit, consultation offerte." },
    ],
  },
  {
    title: 'Zone géographique',
    description: 'Cela nous permet de cibler les bonnes zones dans vos campagnes.',
    fields: [
      { id: 'main_city', label: 'Ville principale', type: 'text', hint: "La ville où se trouve votre activité principale." },
      { id: 'served_areas', label: 'Zones desservies', type: 'textarea', hint: "Toutes les zones où vous intervenez. Ex : Paris, Île-de-France." },
      { id: 'max_distance', label: 'Distance maximale', type: 'text', hint: "Rayon maximal couvert. Ex : 30 km, toute l'IDF." },
    ],
  },
  {
    title: 'Client cible',
    description: 'Cela nous aide à cibler précisément les bonnes personnes avec vos publicités.',
    fields: [
      { id: 'client_type', label: 'Type de clients', type: 'radio', options: ['Particuliers', 'Entreprises', 'Les deux'], hint: "Particuliers, entreprises (B2B), ou les deux ?" },
      { id: 'ideal_client', label: 'Client idéal', type: 'textarea', hint: "Décrivez votre client parfait. Ex : propriétaire 35-55 ans, budget moyen 2000€." },
      { id: 'min_budget', label: 'Budget minimum de vos clients', type: 'textarea', hint: "Le budget min qu'un client doit avoir. Ex : à partir de 300€." },
      { id: 'avoid_clients', label: 'Clients à éviter', type: 'textarea', optional: true, hint: "Type de demandes à éviter. Ex : petits budgets, hors zone." },
    ],
  },
  {
    title: 'Objectifs',
    description: 'Cela nous aide à définir la stratégie publicitaire et les résultats attendus.',
    fields: [
      { id: 'main_objective', label: 'Objectif principal', type: 'radio', options: ['Leads', 'Clients', "Chiffre d'affaires"], hint: "Votre objectif prioritaire." },
      { id: 'monthly_leads', label: 'Leads souhaités par mois', type: 'text', hint: "Nombre approximatif de demandes par mois." },
      { id: 'monthly_clients', label: 'Clients souhaités par mois', type: 'text', hint: "Nombre de nouveaux clients signés par mois." },
      { id: 'monthly_budget', label: 'Budget publicité mensuel', type: 'text', hint: "Budget pour Facebook/Instagram Ads. (Hors prestation agence.)" },
    ],
  },
  {
    title: 'Gestion des leads',
    description: "Cela nous permet d'organiser le suivi des demandes générées.",
    fields: [
      { id: 'who_responds', label: 'Qui répond aux leads', type: 'text', hint: "Nom et rôle de la personne en charge des réponses." },
      { id: 'response_time', label: 'Temps de réponse habituel', type: 'text', hint: "En combien de temps répondez-vous ? Plus c'est rapide, mieux ça convertit." },
      { id: 'main_contact_method', label: 'Mode de contact préféré', type: 'radio', options: ['Appel', 'WhatsApp', 'Email'], hint: "Comment préférez-vous recontacter les prospects ?" },
      { id: 'availability', label: 'Disponibilité', type: 'text', hint: "Horaires de dispo. Ex : lun-ven 8h-19h." },
    ],
  },
  {
    title: 'Contenu marketing',
    description: 'Partagez les fichiers et médias qui seront utilisés pour vos publicités.',
    fields: [
      { id: 'photos', label: 'Photos', type: 'file-or-link', optional: true, hint: "Photos de réalisations, équipe, locaux ou produits. Les visuels réels convertissent mieux." },
      { id: 'videos', label: 'Vidéos', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages, avant/après. La vidéo est le format le plus performant." },
      { id: 'testimonials', label: 'Témoignages', type: 'file-or-link', optional: true, hint: "Captures d'avis Google/Facebook ou témoignages écrits." },
      { id: 'logo', label: 'Logo', type: 'file-or-link', optional: true, hint: "Votre logo HD (PNG/SVG)." },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, grille tarifaire, etc." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès nous permettent de configurer et lancer vos campagnes.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'fb_business_manager', label: 'Facebook Business Manager', type: 'textarea', hint: "Lien ou ID de votre Business Manager." },
      { id: 'fb_page', label: 'Page Facebook', type: 'text', hint: "Lien vers votre page pro. Ex : facebook.com/votreentreprise" },
      { id: 'ad_account', label: 'Compte publicitaire Facebook', type: 'text', hint: "ID du compte pub (act_XXXXXXXXX)." },
      { id: 'pixel', label: 'Pixel Facebook', type: 'text', optional: true, hint: "ID de votre pixel si vous en avez un." },
      { id: 'site_access', label: 'Accès site web / CMS', type: 'textarea', optional: true, hint: "Identifiants pour installer le pixel et configurer le tracking." },
      { id: 'google_analytics', label: 'Google Analytics', type: 'text', optional: true, hint: "ID GA (G-XXXXX ou UA-XXXXX) si utilisé." },
      { id: 'google_tag_manager', label: 'Google Tag Manager', type: 'text', optional: true, hint: "ID GTM (GTM-XXXXX) si utilisé." },
    ],
  },
];

export function getOnboardingSteps(formType: 'website' | 'ads'): FormStep[] {
  return formType === 'website' ? WEBSITE_STEPS : ADS_STEPS;
}
