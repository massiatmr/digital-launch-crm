import { useState, useEffect, useCallback } from 'react';
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
      { id: 'contact_name', label: 'Nom du contact', type: 'text', hint: "Prénom et nom de la personne responsable du projet." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Email principal utilisé pour la communication avec les clients et la réception des demandes." },
      { id: 'company_phone', label: "Numéro de téléphone de l'entreprise", type: 'tel', hint: "Numéro principal de l'entreprise utilisé pour être contacté par les clients." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp sur lequel vous souhaitez recevoir les demandes clients et les leads." },
      { id: 'current_website', label: 'Site web actuel', type: 'text', optional: true, placeholder: 'https://...', hint: "Si vous avez déjà un site web, indiquez l'adresse ici." },
      { id: 'domain', label: 'Domaine', type: 'text', optional: true, placeholder: 'monsite.com', hint: "Nom de domaine que vous possédez ou souhaitez utiliser pour le nouveau site." },
    ],
  },
  {
    title: 'Objectif du site',
    description: 'Cela nous permet de comprendre ce que vous attendez de votre site web.',
    fields: [
      { id: 'site_type', label: 'Type de site', type: 'radio', options: ['Landing page', 'Site vitrine', 'E-commerce', 'Autre'], hint: "Quel type de site correspond le mieux à votre besoin ?" },
      { id: 'main_goal', label: 'Objectif principal', type: 'radio', options: ['Générer des leads', "Présenter l'entreprise", 'Vendre', 'Prise de rendez-vous'], hint: "Qu'attendez-vous principalement de votre site ?" },
      { id: 'main_service', label: 'Service principal', type: 'text', hint: "Le service ou l'activité principale que le site doit mettre en avant." },
      { id: 'main_offer', label: 'Offre principale à mettre en avant', type: 'textarea', hint: "Service ou offre que vous souhaitez mettre en avant sur le site." },
      { id: 'expected_result', label: 'Résultat attendu avec le site', type: 'textarea', hint: "Décrivez concrètement ce que vous espérez obtenir grâce au site." },
    ],
  },
  {
    title: 'Offre et contenu',
    description: 'Cela nous permet de comprendre votre service et de créer un contenu adapté.',
    fields: [
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez les principaux services que vous proposez à vos clients." },
      { id: 'avg_price', label: 'Prix moyen', type: 'text', hint: "Fourchette de prix moyenne de vos services. Ex : 500€ - 2000€." },
      { id: 'main_offer_detail', label: 'Offre principale', type: 'textarea', hint: "Service ou offre que vous souhaitez mettre en avant dans la campagne ou sur le site." },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text', hint: "Ce qui vous différencie de vos concurrents en une phrase." },
      { id: 'why_choose', label: 'Pourquoi les clients vous choisissent', type: 'textarea', hint: "Les raisons principales pour lesquelles vos clients font appel à vous." },
      { id: 'testimonials', label: 'Témoignages', type: 'textarea', optional: true, hint: "Copiez-collez ici des avis ou témoignages de vos clients satisfaits." },
    ],
  },
  {
    title: 'Design',
    description: 'Ces éléments nous aident à créer un design qui correspond à votre image de marque.',
    fields: [
      { id: 'logo', label: 'Logo (upload ou lien)', type: 'file-or-link', hint: "Envoyez votre logo en haute qualité (PNG ou SVG de préférence)." },
      { id: 'brand_colors', label: 'Couleurs de la marque', type: 'text', placeholder: '#000000, #FFFFFF...', hint: "Les couleurs principales de votre marque en code hex ou en nom." },
      { id: 'reference_sites', label: 'Sites de référence', type: 'textarea', optional: true, placeholder: 'https://...', hint: "Des sites web dont vous aimez le design et qui pourraient servir d'inspiration." },
      { id: 'style', label: 'Style souhaité', type: 'radio', options: ['Moderne', 'Premium', 'Minimaliste', 'Corporate', 'Autre'], hint: "Le style visuel que vous préférez pour votre site." },
    ],
  },
  {
    title: 'Fonctionnalités',
    description: 'Sélectionnez les fonctionnalités dont vous avez besoin sur votre site.',
    fields: [
      { id: 'features', label: 'Fonctionnalités souhaitées', type: 'checkbox-multi', options: ['Formulaire de contact', 'WhatsApp', 'Devis', 'Réservation', 'Paiement', 'Blog', 'Autre'], hint: "Cochez toutes les fonctionnalités que vous souhaitez intégrer." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès permettent de lancer rapidement le projet technique.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'hosting_access', label: 'Accès hébergement', type: 'textarea', hint: "Identifiants de connexion à votre hébergeur (OVH, Ionos, etc.)." },
      { id: 'domain_access', label: 'Accès domaine', type: 'textarea', hint: "Identifiants pour gérer votre nom de domaine (DNS, registrar)." },
      { id: 'wordpress_access', label: 'Accès WordPress', type: 'textarea', optional: true, hint: "URL d'admin + identifiants WordPress si vous en avez un." },
      { id: 'email_access', label: 'Accès email professionnel', type: 'textarea', optional: true, hint: "Identifiants de votre messagerie professionnelle si nécessaire." },
    ],
  },
  {
    title: 'Ressources',
    description: 'Partagez les fichiers et médias qui seront utilisés pour votre projet.',
    fields: [
      { id: 'photos', label: 'Photos disponibles', type: 'file-or-link', optional: true, hint: "Photos de vos locaux, équipe, réalisations, produits, etc." },
      { id: 'videos', label: 'Vidéos disponibles', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages vidéo, etc." },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, plaquettes, catalogues ou tout document utile." },
    ],
  },
];

const ADS_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    description: 'Nous avons besoin de ces informations pour créer votre fiche client et vous contacter facilement.',
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text', hint: "Nom officiel de votre entreprise ou nom commercial utilisé par vos clients." },
      { id: 'contact_name', label: 'Nom du contact', type: 'text', hint: "Prénom et nom de la personne responsable du projet." },
      { id: 'company_email', label: "Email de l'entreprise", type: 'email', hint: "Email principal utilisé pour la communication avec les clients et la réception des demandes." },
      { id: 'company_phone', label: "Numéro de téléphone de l'entreprise", type: 'tel', hint: "Numéro principal de l'entreprise utilisé pour être contacté par les clients." },
      { id: 'company_whatsapp', label: "WhatsApp de l'entreprise", type: 'tel', hint: "Numéro WhatsApp sur lequel vous souhaitez recevoir les demandes clients et les leads." },
      { id: 'website', label: 'Site web', type: 'text', optional: true, hint: "Adresse de votre site web actuel si vous en avez un." },
      { id: 'landing_page', label: 'Landing page', type: 'text', optional: true, hint: "URL de la page d'atterrissage si vous en avez déjà une." },
    ],
  },
  {
    title: 'Activité',
    description: 'Cela nous permet de comprendre votre entreprise et votre marché.',
    fields: [
      { id: 'activity_type', label: "Type d'activité", type: 'text', hint: "Votre secteur d'activité. Ex : déménagement, plomberie, coaching, etc." },
      { id: 'services', label: 'Services proposés', type: 'textarea', hint: "Listez les principaux services que vous proposez à vos clients." },
      { id: 'avg_price', label: 'Prix moyen', type: 'text', hint: "Fourchette de prix moyenne de vos services. Ex : 500€ - 2000€." },
      { id: 'main_offer', label: 'Offre principale', type: 'textarea', hint: "Service ou offre que vous souhaitez mettre en avant dans la campagne ou sur le site." },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text', hint: "Ce qui vous différencie de vos concurrents en une phrase." },
      { id: 'client_guarantee', label: 'Garantie client', type: 'text', hint: "La garantie ou promesse que vous offrez à vos clients. Ex : satisfaction garantie, devis gratuit, etc." },
    ],
  },
  {
    title: 'Offre à promouvoir',
    description: 'Cela nous aide à créer des annonces percutantes et adaptées à votre offre.',
    fields: [
      { id: 'promoted_offer', label: 'Offre principale à promouvoir', type: 'textarea', hint: "L'offre spécifique que vous souhaitez mettre en avant dans vos publicités." },
      { id: 'main_message', label: 'Message principal', type: 'textarea', hint: "Le message clé que vous souhaitez transmettre à vos futurs clients." },
      { id: 'current_promo', label: 'Promotion actuelle', type: 'text', optional: true, hint: "Si vous avez une promotion en cours, indiquez-la ici." },
      { id: 'special_offer', label: 'Offre spéciale', type: 'text', optional: true, hint: "Offre limitée ou spéciale que vous souhaitez proposer. Ex : -20% ce mois-ci." },
      { id: 'why_choose', label: 'Pourquoi un client doit vous choisir', type: 'textarea', hint: "Les arguments principaux qui convaincraient un prospect de vous choisir." },
    ],
  },
  {
    title: 'Zone',
    description: 'Cela nous permet de cibler les bonnes zones géographiques dans vos campagnes.',
    fields: [
      { id: 'main_city', label: 'Ville principale', type: 'text', hint: "La ville où se trouve votre activité principale." },
      { id: 'served_areas', label: 'Zones desservies', type: 'textarea', hint: "Zone géographique dans laquelle vous souhaitez recevoir des clients." },
      { id: 'max_distance', label: 'Distance maximale', type: 'text', hint: "Distance maximale que vous êtes prêt à couvrir. Ex : 30 km, toute l'Île-de-France, etc." },
      { id: 'most_profitable_area', label: 'Zone la plus rentable', type: 'text', hint: "La zone géographique où vous obtenez le plus de clients ou de chiffre d'affaires." },
    ],
  },
  {
    title: 'Client cible',
    description: 'Cela nous aide à cibler les bonnes personnes avec vos publicités.',
    fields: [
      { id: 'client_type', label: 'Type de clients', type: 'radio', options: ['Particuliers', 'Entreprises', 'Les deux'], hint: "Vos clients sont principalement des particuliers, des entreprises, ou les deux ?" },
      { id: 'ideal_client', label: 'Type de client idéal', type: 'textarea', hint: "Décrivez votre client parfait. Ex : propriétaire, 35-55 ans, budget moyen 5000€." },
      { id: 'min_budget', label: 'Budget minimum client', type: 'text', hint: "Budget minimum que votre client doit avoir pour travailler avec vous. Ex : déménagement à partir de 300€, site web à partir de 1000€, etc." },
      { id: 'request_type', label: 'Type de demande souhaitée', type: 'text', hint: "Le type de demande que vous souhaitez recevoir. Ex : devis, appel, rendez-vous." },
      { id: 'avoid_clients', label: 'Clients à éviter', type: 'textarea', optional: true, hint: "Type de clients ou demandes que vous ne souhaitez pas recevoir." },
    ],
  },
  {
    title: 'Objectifs',
    description: 'Cela nous aide à définir la stratégie et les résultats attendus.',
    fields: [
      { id: 'main_objective', label: 'Objectif principal', type: 'radio', options: ['Leads', 'Clients', "Chiffre d'affaires"], hint: "Quel est votre objectif prioritaire avec les campagnes publicitaires ?" },
      { id: 'monthly_leads', label: 'Leads souhaités par mois', type: 'text', hint: "Nombre approximatif de demandes que vous souhaitez recevoir chaque mois." },
      { id: 'monthly_clients', label: 'Clients souhaités par mois', type: 'text', hint: "Nombre de nouveaux clients que vous souhaitez signer chaque mois." },
      { id: 'monthly_budget', label: 'Budget publicité mensuel', type: 'text', hint: "Budget mensuel que vous souhaitez investir dans la publicité pour générer des leads." },
    ],
  },
  {
    title: 'Gestion des leads',
    description: "Cela nous permet d'organiser le suivi des demandes entrantes.",
    fields: [
      { id: 'who_responds', label: 'Qui répond aux leads', type: 'text', hint: "Qui dans votre équipe sera chargé de répondre aux demandes ?" },
      { id: 'response_time', label: 'Temps de réponse', type: 'text', hint: "En combien de temps répondez-vous habituellement ? Ex : moins de 30 minutes, dans l'heure, etc." },
      { id: 'main_contact_method', label: 'Contact principal', type: 'radio', options: ['Appel', 'WhatsApp', 'Email'], hint: "Comment préférez-vous être contacté par les leads ?" },
      { id: 'availability', label: 'Disponibilité', type: 'text', hint: "Vos horaires de disponibilité pour répondre aux leads. Ex : lun-ven 8h-19h." },
    ],
  },
  {
    title: 'Contenu marketing',
    description: 'Partagez les fichiers et médias qui seront utilisés pour vos campagnes.',
    fields: [
      { id: 'photos', label: 'Photos disponibles', type: 'file-or-link', optional: true, hint: "Photos de vos locaux, équipe, réalisations, produits, etc." },
      { id: 'videos', label: 'Vidéos disponibles', type: 'file-or-link', optional: true, hint: "Vidéos de présentation, témoignages vidéo, avant/après, etc." },
      { id: 'testimonials', label: 'Témoignages disponibles', type: 'file-or-link', optional: true, hint: "Captures d'écran d'avis Google, Facebook, ou témoignages écrits." },
      { id: 'logo', label: 'Logo disponible', type: 'file-or-link', optional: true, hint: "Votre logo en haute qualité (PNG ou SVG de préférence)." },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true, hint: "Brochures, plaquettes, catalogues ou tout document utile." },
    ],
  },
  {
    title: 'Accès techniques',
    description: 'Ces accès permettent de lancer rapidement le projet technique.',
    skipCheckbox: "J'ai déjà partagé ces accès",
    fields: [
      { id: 'fb_business_manager', label: 'Facebook Business Manager', type: 'textarea', hint: "Lien ou identifiant de votre Business Manager Facebook." },
      { id: 'fb_page', label: 'Page Facebook', type: 'text', hint: "Nom ou lien de votre page Facebook professionnelle." },
      { id: 'ad_account', label: 'Compte publicitaire', type: 'text', hint: "Identifiant de votre compte publicitaire Facebook (act_XXXXXXXXX)." },
      { id: 'pixel', label: 'Pixel', type: 'text', hint: "Identifiant de votre pixel Facebook si vous en avez un." },
      { id: 'site_access', label: 'Accès site web', type: 'textarea', optional: true, hint: "Identifiants de connexion à votre site web (admin, CMS, etc.)." },
      { id: 'domain_access', label: 'Accès domaine', type: 'textarea', optional: true, hint: "Identifiants pour gérer votre nom de domaine (DNS, registrar)." },
      { id: 'landing_access', label: 'Accès landing page', type: 'textarea', optional: true, hint: "Identifiants de votre landing page builder si applicable." },
      { id: 'google_analytics', label: 'Google Analytics', type: 'text', optional: true, hint: "Identifiant Google Analytics (UA-XXXXX ou G-XXXXX)." },
      { id: 'google_tag_manager', label: 'Google Tag Manager', type: 'text', optional: true, hint: "Identifiant Google Tag Manager (GTM-XXXXX)." },
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
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 mb-4">
            <span className="text-xl font-bold text-primary">
              {onboarding.clients?.company_name?.charAt(0) || 'C'}
            </span>
          </div>
          {onboarding.clients?.company_name && (
            <p className="text-sm text-muted-foreground mb-1">{onboarding.clients.company_name}</p>
          )}
          <h1 className="text-2xl font-bold">{formTitle}</h1>
        </div>

        {/* Intro text - only on first step */}
        {currentStep === 0 && (
          <Card className="p-5 mb-8 border-primary/20 bg-primary/5">
            <p className="text-sm leading-relaxed">
              <strong>Bienvenue dans le formulaire de préparation du projet.</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Ce formulaire nous permet de comprendre votre entreprise, votre offre et vos objectifs afin de créer une stratégie efficace.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Cela prend environ <strong>5 à 7 minutes</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Certaines informations peuvent déjà avoir été partagées avec nous.
              Si c'est le cas, vous pouvez simplement cocher <em>"information déjà partagée"</em> et passer à l'étape suivante.
            </p>
            <p className="text-sm text-primary mt-2 font-medium">
              Plus les informations sont précises, meilleurs seront les résultats.
            </p>
          </Card>
        )}

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Étape {currentStep + 1} / {steps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step content */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">Étape {currentStep + 1} — {step.title}</h2>
          {step.description && (
            <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
          )}

          {/* Skip checkbox - only for technical accesses */}
          {step.skipCheckbox && (
            <label className="flex items-center gap-2 mt-3 mb-4 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 cursor-pointer">
              <Checkbox
                checked={!!skippedSteps[currentStep]}
                onCheckedChange={() => toggleSkip(currentStep)}
              />
              <span className="text-sm">{step.skipCheckbox}</span>
            </label>
          )}

          {/* Fields */}
          {!skippedSteps[currentStep] && (
            <div className="space-y-5 mt-4">
              {step.fields.map(field => (
                <div key={field.id}>
                  <Label className="text-sm">
                    {field.label}
                    {field.optional && <span className="text-muted-foreground ml-1">(optionnel)</span>}
                  </Label>
                  {field.hint && (
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{field.hint}</p>
                  )}
                  <div className="mt-1">
                    {field.type === 'text' || field.type === 'email' || field.type === 'tel' ? (
                      <Input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={getFieldValue(field.id)}
                        onChange={e => updateField(field.id, e.target.value)}
                      />
                    ) : field.type === 'textarea' ? (
                      <Textarea
                        placeholder={field.placeholder}
                        value={getFieldValue(field.id)}
                        onChange={e => updateField(field.id, e.target.value)}
                        rows={3}
                      />
                    ) : field.type === 'radio' ? (
                      <RadioGroup value={getFieldValue(field.id)} onValueChange={v => updateField(field.id, v)}>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {field.options?.map(opt => (
                            <label key={opt} className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                              <RadioGroupItem value={opt} />
                              <span className="text-sm">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </RadioGroup>
                    ) : field.type === 'checkbox-multi' ? (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {field.options?.map(opt => {
                          const vals: string[] = getFieldValue(field.id) || [];
                          const checked = vals.includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  const newVals = checked ? vals.filter(v => v !== opt) : [...vals, opt];
                                  updateField(field.id, newVals);
                                }}
                              />
                              <span className="text-sm">{opt}</span>
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
              ))}
            </div>
          )}

          {skippedSteps[currentStep] && (
            <p className="text-sm text-muted-foreground mt-4 text-center py-8">
              ✅ Section validée — les accès ont déjà été partagés.
            </p>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={handlePrev} disabled={currentStep === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" />Précédent
          </Button>
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext}>
              Suivant<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={saveResponses.isPending}>
              {saveResponses.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Terminer
            </Button>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-1.5 mt-6">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => { autoSave(); setCurrentStep(i); }}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === currentStep ? 'bg-primary' : i < currentStep || skippedSteps[i] ? 'bg-primary/40' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          💾 Sauvegarde automatique activée
        </p>
      </div>
    </div>
  );
}
