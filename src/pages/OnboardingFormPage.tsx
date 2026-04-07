import { useState, useEffect, useCallback } from 'react';
import logo from '@/assets/logo.webp';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import { useOnboardingByToken, useSaveOnboardingResponses } from '@/hooks/useClientData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'radio' | 'checkbox-multi' | 'file-or-link' | 'select';

interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  optional?: boolean;
  placeholder?: string;
  hint?: string;
}

interface FormStep {
  title: string;
  description?: string;
  skipCheckbox?: string;
  fields: FormField[];
}

const WEBSITE_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    description: 'Nous avons besoin de ces informations pour créer votre fiche client et vous contacter facilement.',
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text', hint: "Nom officiel de votre entreprise ou nom commercial utilisé par vos clients." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Adresse email professionnelle de l'entreprise (pas votre email personnel). C'est l'adresse qui sera utilisée pour les communications avec vos clients." },
      { id: 'company_phone', label: "Téléphone de l'entreprise", type: 'tel', hint: "Numéro principal de l'entreprise, celui que vos clients utilisent pour vous joindre." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp professionnel de l'entreprise sur lequel vous souhaitez recevoir les demandes de vos clients et les leads générés." },
      { id: 'current_website', label: 'Site web actuel', type: 'text', optional: true, placeholder: 'https://monsite.com', hint: "Si vous avez déjà un site web, indiquez l'adresse complète ici. Sinon, laissez vide." },
    ],
  },
  {
    title: 'Objectif du site',
    description: "Cela nous permet de comprendre ce que vous attendez de votre site web et de construire quelque chose d'adapté.",
    fields: [
      { id: 'site_type', label: 'Type de site', type: 'radio', options: ['Landing page', 'Site vitrine', 'E-commerce', 'Autre'], hint: "Quel format de site correspond le mieux à votre besoin ? Une landing page est une page unique centrée sur une action, un site vitrine présente votre entreprise en plusieurs pages." },
      { id: 'main_goal', label: 'Objectif principal', type: 'radio', options: ['Générer des leads', "Présenter l'entreprise", 'Vendre', 'Prise de rendez-vous'], hint: "Que souhaitez-vous que les visiteurs fassent en arrivant sur votre site ?" },
      { id: 'main_service', label: 'Service principal', type: 'text', hint: "Le service ou l'activité principale que le site doit mettre en avant. Ex : plomberie, coaching, déménagement." },
      { id: 'main_offer', label: 'Offre principale à mettre en avant', type: 'textarea', hint: "Décrivez l'offre ou le service phare que vous souhaitez promouvoir en priorité sur votre site." },
      { id: 'expected_result', label: 'Résultat attendu avec le site', type: 'textarea', hint: "Qu'espérez-vous obtenir concrètement ? Ex : 10 demandes de devis par semaine, plus de visibilité dans ma ville, etc." },
    ],
  },
  {
    title: 'Offre et contenu',
    description: 'Cela nous permet de comprendre votre positionnement et de créer un contenu qui parle à vos clients.',
    fields: [
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez tous les services que vous proposez, un par ligne. Ex :\n- Déménagement local\n- Déménagement longue distance\n- Garde-meuble" },
      { id: 'avg_price', label: 'Prix moyen de vos services', type: 'text', hint: "Fourchette de prix habituelle de vos prestations. Ex : à partir de 500€, entre 1000€ et 5000€. Si vous avez des formules, indiquez-les avec les prix correspondants." },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text', hint: "Ce qui vous différencie de vos concurrents en une phrase. Ex : 15 ans d'expérience, devis en 24h, garantie satisfaction." },
      { id: 'why_choose', label: 'Pourquoi les clients vous choisissent', type: 'textarea', hint: "Les raisons principales pour lesquelles vos clients font appel à vous plutôt qu'à un concurrent." },
      { id: 'testimonials', label: 'Témoignages clients', type: 'textarea', optional: true, hint: "Copiez-collez ici des avis ou témoignages de clients satisfaits (Google, Facebook, etc.)." },
    ],
  },
  {
    title: 'Design',
    description: 'Ces éléments nous aident à créer un design qui reflète fidèlement votre image de marque.',
    fields: [
      { id: 'logo', label: 'Logo', type: 'file-or-link', hint: "Envoyez votre logo en haute qualité (PNG, SVG ou PDF de préférence). Si vous n'en avez pas, précisez-le." },
      { id: 'brand_colors', label: 'Couleurs de la marque', type: 'text', placeholder: 'Ex : bleu foncé, doré, #1E3A5F', hint: "Les couleurs principales de votre marque. Indiquez les noms ou les codes hex si vous les connaissez." },
      { id: 'reference_sites', label: 'Sites de référence', type: 'textarea', optional: true, placeholder: 'https://...', hint: "Des sites web dont vous aimez le design et qui pourraient servir d'inspiration pour le vôtre." },
      { id: 'style', label: 'Style souhaité', type: 'radio', options: ['Moderne', 'Premium', 'Minimaliste', 'Corporate', 'Autre'], hint: "Le style visuel général que vous souhaitez pour votre site." },
    ],
  },
  {
    title: 'Fonctionnalités',
    description: 'Sélectionnez les fonctionnalités dont vous avez besoin sur votre site.',
    fields: [
      { id: 'features', label: 'Fonctionnalités souhaitées', type: 'checkbox-multi', options: ['Formulaire de contact', 'WhatsApp', 'Devis en ligne', 'Réservation', 'Paiement en ligne', 'Blog', 'Autre'], hint: "Cochez toutes les fonctionnalités que vous souhaitez intégrer à votre site." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès nous permettent de lancer rapidement la mise en place technique de votre projet.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'hosting_access', label: 'Accès hébergement', type: 'textarea', hint: "Identifiants de connexion à votre hébergeur (OVH, Ionos, Hostinger, etc.). Si vous n'en avez pas, indiquez-le." },
      { id: 'wordpress_access', label: 'Accès CMS / WordPress', type: 'textarea', optional: true, hint: "URL d'admin + identifiants de votre CMS actuel (WordPress, Wix, etc.) si vous en avez un." },
      { id: 'email_access', label: 'Accès email professionnel', type: 'textarea', optional: true, hint: "Identifiants de votre messagerie professionnelle si vous souhaitez que nous la configurions." },
    ],
  },
  {
    title: 'Ressources',
    description: 'Partagez les fichiers et médias qui seront utilisés pour la création de votre site.',
    fields: [
      { id: 'photos', label: 'Photos', type: 'file-or-link', optional: true, hint: "Photos de vos locaux, de votre équipe, de vos réalisations ou de vos produits. Plus vous en fournissez, meilleur sera le résultat." },
      { id: 'videos', label: 'Vidéos', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages vidéo, avant/après de vos projets, etc." },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, plaquettes commerciales, catalogues produits ou tout document qui nous aiderait à mieux vous connaître." },
    ],
  },
];

const ADS_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    description: 'Nous avons besoin de ces informations pour créer votre fiche client et vous contacter facilement.',
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text', hint: "Nom officiel de votre entreprise ou nom commercial utilisé par vos clients." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Adresse email professionnelle de l'entreprise (pas votre email personnel). C'est l'adresse qui sera utilisée pour les communications avec vos clients." },
      { id: 'company_phone', label: "Téléphone de l'entreprise", type: 'tel', hint: "Numéro principal de l'entreprise, celui que vos clients utilisent pour vous joindre." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp professionnel de l'entreprise sur lequel vous souhaitez recevoir les demandes de vos clients et les leads générés." },
      { id: 'website', label: 'Site web', type: 'text', optional: true, placeholder: 'https://monsite.com', hint: "Adresse de votre site web actuel si vous en avez un." },
      { id: 'landing_page', label: 'Landing page', type: 'text', optional: true, placeholder: 'https://...', hint: "URL de votre page d'atterrissage dédiée aux campagnes publicitaires, si elle est différente de votre site principal." },
    ],
  },
  {
    title: 'Activité',
    description: 'Cela nous permet de comprendre votre entreprise, votre marché et votre positionnement.',
    fields: [
      { id: 'activity_type', label: "Type d'activité", type: 'text', hint: "Votre secteur d'activité principal. Ex : déménagement, plomberie, coaching sportif, agence immobilière." },
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez tous les services que vous proposez, un par ligne. Ex :\n- Déménagement local\n- Garde-meuble\n- Nettoyage après déménagement" },
      { id: 'main_offer', label: 'Offre principale', type: 'textarea', hint: "Le service ou l'offre que vous souhaitez mettre en avant dans vos campagnes publicitaires." },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text', hint: "Ce qui vous différencie de vos concurrents en une phrase. Ex : intervention en 2h, devis gratuit en 24h." },
      { id: 'client_guarantee', label: 'Garantie client', type: 'text', hint: "La garantie ou promesse que vous offrez à vos clients. Ex : satisfait ou remboursé, devis gratuit, garantie décennale." },
    ],
  },
  {
    title: 'Offre à promouvoir',
    description: 'Cela nous aide à créer des annonces percutantes et adaptées à votre offre.',
    fields: [
      { id: 'promoted_offer', label: 'Offre principale à promouvoir', type: 'textarea', hint: "L'offre spécifique que vous souhaitez mettre en avant dans vos publicités. Ex : Déménagement à partir de 299€." },
      { id: 'main_message', label: 'Message principal', type: 'textarea', hint: "Le message clé que vous souhaitez transmettre à vos futurs clients dans les annonces." },
      { id: 'current_promo', label: 'Promotion actuelle', type: 'text', optional: true, hint: "Si vous avez une promotion en cours, indiquez-la ici. Ex : -15% jusqu'au 30 juin." },
      { id: 'special_offer', label: 'Offre spéciale', type: 'text', optional: true, hint: "Offre limitée ou bonus que vous souhaitez proposer pour attirer des prospects. Ex : devis gratuit, consultation offerte." },
      { id: 'why_choose', label: 'Pourquoi un client doit vous choisir', type: 'textarea', hint: "Les 3-5 arguments principaux qui convaincraient un prospect de vous choisir plutôt qu'un concurrent." },
    ],
  },
  {
    title: 'Zone géographique',
    description: 'Cela nous permet de cibler les bonnes zones dans vos campagnes publicitaires.',
    fields: [
      { id: 'main_city', label: 'Ville principale', type: 'text', hint: "La ville où se trouve votre activité principale ou votre siège." },
      { id: 'served_areas', label: 'Zones desservies', type: 'textarea', hint: "Toutes les zones géographiques dans lesquelles vous intervenez. Ex : Paris, Île-de-France, Lyon et périphérie." },
      { id: 'max_distance', label: 'Distance maximale', type: 'text', hint: "Rayon maximal autour de votre ville que vous êtes prêt à couvrir. Ex : 30 km, toute l'Île-de-France." },
      { id: 'most_profitable_area', label: 'Zone la plus rentable', type: 'text', hint: "La zone où vous obtenez le plus de clients ou les meilleurs projets. C'est là que nous concentrerons le budget." },
    ],
  },
  {
    title: 'Client cible',
    description: 'Cela nous aide à cibler précisément les bonnes personnes avec vos publicités.',
    fields: [
      { id: 'client_type', label: 'Type de clients', type: 'radio', options: ['Particuliers', 'Entreprises', 'Les deux'], hint: "Vos clients sont principalement des particuliers, des entreprises (B2B), ou les deux ?" },
      { id: 'ideal_client', label: 'Client idéal', type: 'textarea', hint: "Décrivez votre client parfait en détail. Ex : propriétaire, 35-55 ans, qui déménage dans un rayon de 50 km, budget moyen 2000€." },
      { id: 'min_budget', label: 'Budget minimum de vos clients', type: 'text', hint: "Le budget minimum qu'un client doit avoir pour faire appel à vos services. Ex : déménagement à partir de 300€, site web à partir de 1000€. Si vous avez des formules, indiquez les prix de départ de chacune." },
      { id: 'request_type', label: 'Type de demande souhaitée', type: 'text', hint: "Le type de prise de contact que vous préférez recevoir. Ex : demande de devis, appel direct, prise de rendez-vous." },
      { id: 'avoid_clients', label: 'Clients à éviter', type: 'textarea', optional: true, hint: "Type de clients ou de demandes que vous ne souhaitez pas recevoir. Ex : petits budgets en dessous de 200€, demandes hors zone." },
    ],
  },
  {
    title: 'Objectifs',
    description: 'Cela nous aide à définir la stratégie publicitaire et les résultats attendus.',
    fields: [
      { id: 'main_objective', label: 'Objectif principal', type: 'radio', options: ['Leads', 'Clients', "Chiffre d'affaires"], hint: "Quel est votre objectif prioritaire avec les campagnes publicitaires ?" },
      { id: 'monthly_leads', label: 'Leads souhaités par mois', type: 'text', hint: "Nombre approximatif de demandes (devis, appels, messages) que vous souhaitez recevoir chaque mois." },
      { id: 'monthly_clients', label: 'Clients souhaités par mois', type: 'text', hint: "Nombre de nouveaux clients que vous souhaitez convertir et signer chaque mois." },
      { id: 'monthly_budget', label: 'Budget publicité mensuel', type: 'text', hint: "Budget mensuel que vous prévoyez d'investir dans la publicité Facebook/Instagram. Ce budget sert uniquement à payer les plateformes publicitaires." },
    ],
  },
  {
    title: 'Gestion des leads',
    description: "Cela nous permet d'organiser le suivi des demandes générées par vos campagnes.",
    fields: [
      { id: 'who_responds', label: 'Qui répond aux leads', type: 'text', hint: "Qui dans votre équipe sera chargé de répondre aux demandes ? Indiquez le nom et le rôle." },
      { id: 'response_time', label: 'Temps de réponse habituel', type: 'text', hint: "En combien de temps répondez-vous habituellement à une demande ? Un temps de réponse rapide améliore fortement la conversion." },
      { id: 'main_contact_method', label: 'Mode de contact préféré', type: 'radio', options: ['Appel', 'WhatsApp', 'Email'], hint: "Comment préférez-vous recontacter les prospects qui font une demande ?" },
      { id: 'availability', label: 'Disponibilité', type: 'text', hint: "Vos horaires de disponibilité pour répondre aux leads. Ex : lun-ven 8h-19h, sam 9h-13h." },
    ],
  },
  {
    title: 'Contenu marketing',
    description: 'Partagez les fichiers et médias qui seront utilisés pour créer vos publicités.',
    fields: [
      { id: 'photos', label: 'Photos', type: 'file-or-link', optional: true, hint: "Photos de vos réalisations, de votre équipe, de vos locaux ou de vos produits. Les visuels réels convertissent mieux que les photos libres de droits." },
      { id: 'videos', label: 'Vidéos', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages clients filmés, avant/après de vos projets. La vidéo est le format le plus performant en publicité." },
      { id: 'testimonials', label: 'Témoignages', type: 'file-or-link', optional: true, hint: "Captures d'écran d'avis Google, Facebook, ou témoignages écrits de vos clients." },
      { id: 'logo', label: 'Logo', type: 'file-or-link', optional: true, hint: "Votre logo en haute qualité (PNG ou SVG). Utilisé pour l'identité visuelle de vos publicités." },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, plaquettes, grille tarifaire ou tout document qui nous aiderait à mieux comprendre votre offre." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès nous permettent de configurer et lancer vos campagnes publicitaires.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'fb_business_manager', label: 'Facebook Business Manager', type: 'textarea', hint: "Lien ou identifiant de votre Business Manager Facebook. Ex : business.facebook.com → Paramètres → ID Business Manager." },
      { id: 'fb_page', label: 'Page Facebook', type: 'text', hint: "Lien vers votre page Facebook professionnelle. Ex : facebook.com/votreentreprise" },
      { id: 'ad_account', label: 'Compte publicitaire Facebook', type: 'text', hint: "Identifiant de votre compte publicitaire (act_XXXXXXXXX). Trouvable dans Business Manager → Comptes publicitaires." },
      { id: 'pixel', label: 'Pixel Facebook', type: 'text', optional: true, hint: "Identifiant de votre pixel Facebook si vous en avez un déjà installé. Sinon, nous en créerons un." },
      { id: 'site_access', label: 'Accès site web / CMS', type: 'textarea', optional: true, hint: "Identifiants de connexion à votre site (WordPress, Wix, etc.) pour installer le pixel et configurer le tracking." },
      { id: 'google_analytics', label: 'Google Analytics', type: 'text', optional: true, hint: "Identifiant Google Analytics (G-XXXXX ou UA-XXXXX) si vous utilisez cet outil de suivi." },
      { id: 'google_tag_manager', label: 'Google Tag Manager', type: 'text', optional: true, hint: "Identifiant Google Tag Manager (GTM-XXXXX) si vous utilisez cet outil." },
    ],
  },
];

function FileOrLinkField({ id, value, onChange, clientId }: { id: string; value: any; onChange: (v: any) => void; clientId: string }) {
  const [mode, setMode] = useState<'link' | 'file'>(value?.mode || 'link');
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${clientId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('client-resources').upload(path, file);
    if (error) { toast.error('Erreur upload'); setUploading(false); return; }
    const { data } = supabase.storage.from('client-resources').getPublicUrl(path);
    onChange({ mode: 'file', url: data.publicUrl, name: file.name });
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === 'link' ? 'default' : 'outline'} onClick={() => setMode('link')}>Lien</Button>
        <Button type="button" size="sm" variant={mode === 'file' ? 'default' : 'outline'} onClick={() => setMode('file')}>Upload</Button>
      </div>
      {mode === 'link' ? (
        <Input placeholder="https://drive.google.com/..." value={value?.url || ''} onChange={e => onChange({ mode: 'link', url: e.target.value })} />
      ) : (
        <div>
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Upload en cours...</div>
          ) : value?.name ? (
            <p className="text-sm text-primary">✅ {value.name}</p>
          ) : (
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm hover:bg-muted/50 transition-colors">
              <input type="file" className="hidden" onChange={handleFile} />
              Choisir un fichier
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingFormPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const formTypeFromUrl = window.location.pathname.includes('/ads') ? 'ads' : 'website';

  const { data: onboarding, isLoading, error } = useOnboardingByToken(token);
  const saveResponses = useSaveOnboardingResponses();

  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [skippedSteps, setSkippedSteps] = useState<Record<number, boolean>>({});
  const [completed, setCompleted] = useState(false);

  const steps = formTypeFromUrl === 'website' ? WEBSITE_STEPS : ADS_STEPS;
  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const clientId = onboarding?.client_id || 'anon';

  useEffect(() => {
    if (onboarding?.responses && Object.keys(onboarding.responses).length > 0) {
      setResponses(onboarding.responses);
      if (onboarding.responses._skippedSteps) {
        setSkippedSteps(onboarding.responses._skippedSteps);
      }
    }
    if (onboarding?.completed) setCompleted(true);
  }, [onboarding]);

  const autoSave = useCallback(() => {
    if (!token) return;
    const allData = { ...responses, _skippedSteps: skippedSteps };
    saveResponses.mutate({ token, responses: allData });
  }, [token, responses, skippedSteps, saveResponses]);

  useEffect(() => {
    const timer = setTimeout(autoSave, 2000);
    return () => clearTimeout(timer);
  }, [responses, skippedSteps]);

  const updateField = (fieldId: string, value: any) => {
    setResponses(prev => ({ ...prev, [`step${currentStep}_${fieldId}`]: value }));
  };

  const getFieldValue = (fieldId: string) => responses[`step${currentStep}_${fieldId}`] || '';

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      autoSave();
      setCurrentStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleComplete = async () => {
    if (!token) return;
    const allData = { ...responses, _skippedSteps: skippedSteps };
    await saveResponses.mutateAsync({ token, responses: allData, completed: true });
    setCompleted(true);
  };

  const toggleSkip = (stepIdx: number) => {
    setSkippedSteps(prev => ({ ...prev, [stepIdx]: !prev[stepIdx] }));
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error || !onboarding) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md">
        <p className="text-lg font-semibold">Lien invalide</p>
        <p className="text-sm text-muted-foreground mt-2">Ce formulaire n'existe pas ou le lien est expiré.</p>
      </Card>
    </div>
  );

  if (completed) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Merci !</h2>
        <p className="text-muted-foreground">Vos informations ont été enregistrées avec succès. Notre équipe va les analyser et reviendra vers vous rapidement.</p>
      </Card>
    </div>
  );

  const formTitle = formTypeFromUrl === 'website' ? 'Onboarding Site Web' : 'Onboarding Campagnes Publicitaires';

  const isFieldFilled = (fieldId: string) => {
    const val = getFieldValue(fieldId);
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object' && val !== null) return !!val.url;
    return !!val && String(val).trim() !== '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="Digital Launch" className="h-12 w-auto mx-auto mb-4" />
          {onboarding.clients?.company_name && (
            <p className="text-sm text-muted-foreground mb-1">{onboarding.clients.company_name}</p>
          )}
          <h1 className="text-2xl font-bold">{formTitle}</h1>
        </div>

        {/* Intro text - only on first step */}
        {currentStep === 0 && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 mb-8">
            <p className="text-sm leading-relaxed font-medium">
              Bienvenue dans le formulaire de préparation du projet.
            </p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Ce formulaire nous permet de comprendre votre entreprise, votre offre et vos objectifs afin de créer une stratégie efficace.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Cela prend environ <strong>5 à 7 minutes</strong>.
            </p>
            <p className="text-sm text-primary mt-2 font-medium">
              ✨ Plus les informations sont précises, meilleurs seront les résultats.
            </p>
          </div>
        )}

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-medium">Étape {currentStep + 1} sur {steps.length}</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2.5 rounded-full" />
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
              {currentStep + 1}
            </div>
            <h2 className="text-lg font-semibold">{step.title}</h2>
          </div>
          {step.description && (
            <p className="text-sm text-muted-foreground mb-6 ml-11">{step.description}</p>
          )}

          {/* Skip checkbox - only for technical accesses */}
          {step.skipCheckbox && (
            <label className="flex items-center gap-3 mt-3 mb-4 p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-colors">
              <Checkbox
                checked={!!skippedSteps[currentStep]}
                onCheckedChange={() => toggleSkip(currentStep)}
              />
              <span className="text-sm font-medium">{step.skipCheckbox}</span>
            </label>
          )}

          {/* Fields */}
          {!skippedSteps[currentStep] && (
            <div className="space-y-6 mt-4">
              {step.fields.map(field => {
                const filled = isFieldFilled(field.id);
                return (
                  <div key={field.id} className={`group rounded-xl border-2 p-4 transition-all duration-200 ${
                    filled 
                      ? 'border-primary/30 bg-primary/[0.03]' 
                      : 'border-transparent bg-muted/30 hover:bg-muted/50'
                  }`}>
                    <div className="flex items-start gap-2 mb-1">
                      <Label className="text-sm font-semibold leading-tight">
                        {field.label}
                      </Label>
                      {field.optional && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">optionnel</span>
                      )}
                      {filled && (
                        <div className="ml-auto shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                      )}
                    </div>
                    {field.hint && (
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{field.hint}</p>
                    )}
                    <div>
                      {field.type === 'text' || field.type === 'email' || field.type === 'tel' ? (
                        <Input
                          type={field.type}
                          placeholder={field.placeholder || `Votre ${field.label.toLowerCase()}…`}
                          value={getFieldValue(field.id)}
                          onChange={e => updateField(field.id, e.target.value)}
                          className="border-border/80 bg-background shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary transition-all h-11"
                        />
                      ) : field.type === 'textarea' ? (
                        <Textarea
                          placeholder={field.placeholder || `Votre ${field.label.toLowerCase()}…`}
                          value={getFieldValue(field.id)}
                          onChange={e => updateField(field.id, e.target.value)}
                          rows={3}
                          className="border-border/80 bg-background shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary transition-all resize-none"
                        />
                      ) : field.type === 'radio' ? (
                        <RadioGroup value={getFieldValue(field.id)} onValueChange={v => updateField(field.id, v)}>
                          <div className="grid grid-cols-2 gap-2">
                            {field.options?.map(opt => {
                              const isSelected = getFieldValue(field.id) === opt;
                              return (
                                <label key={opt} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                  isSelected 
                                    ? 'border-primary bg-primary/10 shadow-sm' 
                                    : 'border-border/60 bg-background hover:border-border hover:shadow-sm'
                                }`}>
                                  <RadioGroupItem value={opt} className="shrink-0" />
                                  <span className={`text-sm ${isSelected ? 'font-medium' : ''}`}>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        </RadioGroup>
                      ) : field.type === 'checkbox-multi' ? (
                        <div className="grid grid-cols-2 gap-2">
                          {field.options?.map(opt => {
                            const vals: string[] = getFieldValue(field.id) || [];
                            const checked = vals.includes(opt);
                            return (
                              <label key={opt} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                checked 
                                  ? 'border-primary bg-primary/10 shadow-sm' 
                                  : 'border-border/60 bg-background hover:border-border hover:shadow-sm'
                              }`}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    const newVals = checked ? vals.filter(v => v !== opt) : [...vals, opt];
                                    updateField(field.id, newVals);
                                  }}
                                />
                                <span className={`text-sm ${checked ? 'font-medium' : ''}`}>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : field.type === 'file-or-link' ? (
                        <FileOrLinkField
                          id={field.id}
                          clientId={clientId}
                          value={getFieldValue(field.id)}
                          onChange={v => updateField(field.id, v)}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {skippedSteps[currentStep] && (
            <div className="mt-4 text-center py-10 rounded-xl bg-primary/5 border border-primary/10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 mb-3">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                Section validée — les accès ont déjà été partagés.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button variant="outline" onClick={handlePrev} disabled={currentStep === 0} className="rounded-xl h-11 px-5">
            <ChevronLeft className="h-4 w-4 mr-1" />Précédent
          </Button>
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} className="rounded-xl h-11 px-6 shadow-md">
              Suivant<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={saveResponses.isPending} className="rounded-xl h-11 px-6 shadow-md">
              {saveResponses.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Terminer
            </Button>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {steps.map((s, i) => {
            const isActive = i === currentStep;
            const isDone = i < currentStep || skippedSteps[i];
            return (
              <button
                key={i}
                onClick={() => { autoSave(); setCurrentStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`relative transition-all duration-300 rounded-full ${
                  isActive 
                    ? 'w-8 h-3 bg-primary shadow-md' 
                    : isDone 
                      ? 'w-3 h-3 bg-primary/50' 
                      : 'w-3 h-3 bg-muted hover:bg-muted-foreground/30'
                }`}
                title={s.title}
              />
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Sauvegarde automatique activée
        </p>
      </div>
    </div>
  );
}
