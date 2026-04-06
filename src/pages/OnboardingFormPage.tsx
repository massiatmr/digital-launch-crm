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
}

interface FormStep {
  title: string;
  skipCheckbox?: string;
  fields: FormField[];
}

const WEBSITE_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text' },
      { id: 'contact_name', label: 'Nom du contact', type: 'text' },
      { id: 'email', label: 'Email', type: 'email' },
      { id: 'phone', label: 'Téléphone', type: 'tel' },
      { id: 'whatsapp', label: 'WhatsApp', type: 'tel' },
      { id: 'current_website', label: 'Site web actuel', type: 'text', optional: true, placeholder: 'https://...' },
      { id: 'domain', label: 'Domaine', type: 'text', optional: true, placeholder: 'monsite.com' },
    ],
  },
  {
    title: 'Objectif du site',
    fields: [
      { id: 'site_type', label: 'Type de site', type: 'radio', options: ['Landing page', 'Site vitrine', 'E-commerce', 'Autre'] },
      { id: 'main_goal', label: 'Objectif principal', type: 'radio', options: ['Générer des leads', "Présenter l'entreprise", 'Vendre', 'Prise de rendez-vous'] },
      { id: 'main_service', label: 'Service principal', type: 'text' },
      { id: 'main_offer', label: 'Offre principale à mettre en avant', type: 'textarea' },
      { id: 'expected_result', label: 'Résultat attendu avec le site', type: 'textarea' },
    ],
  },
  {
    title: 'Offre et contenu',
    skipCheckbox: 'Informations déjà partagées',
    fields: [
      { id: 'services', label: 'Services proposés', type: 'textarea' },
      { id: 'avg_price', label: 'Prix moyen', type: 'text' },
      { id: 'main_offer_detail', label: 'Offre principale', type: 'textarea' },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text' },
      { id: 'why_choose', label: 'Pourquoi les clients vous choisissent', type: 'textarea' },
      { id: 'testimonials', label: 'Témoignages', type: 'textarea', optional: true },
    ],
  },
  {
    title: 'Design',
    skipCheckbox: 'Logo et design déjà partagés',
    fields: [
      { id: 'logo', label: 'Logo (upload ou lien)', type: 'file-or-link' },
      { id: 'brand_colors', label: 'Couleurs de la marque', type: 'text', placeholder: '#000000, #FFFFFF...' },
      { id: 'reference_sites', label: 'Sites de référence', type: 'textarea', optional: true, placeholder: 'https://...' },
      { id: 'style', label: 'Style souhaité', type: 'radio', options: ['Moderne', 'Premium', 'Minimaliste', 'Corporate', 'Autre'] },
    ],
  },
  {
    title: 'Fonctionnalités',
    fields: [
      { id: 'features', label: 'Fonctionnalités souhaitées', type: 'checkbox-multi', options: ['Formulaire de contact', 'WhatsApp', 'Devis', 'Réservation', 'Paiement', 'Blog', 'Autre'] },
    ],
  },
  {
    title: 'Accès techniques',
    skipCheckbox: 'Accès déjà partagés',
    fields: [
      { id: 'hosting_access', label: 'Accès hébergement', type: 'textarea' },
      { id: 'domain_access', label: 'Accès domaine', type: 'textarea' },
      { id: 'wordpress_access', label: 'Accès WordPress', type: 'textarea', optional: true },
      { id: 'email_access', label: 'Accès email professionnel', type: 'textarea', optional: true },
    ],
  },
  {
    title: 'Ressources',
    skipCheckbox: 'Ressources déjà envoyées',
    fields: [
      { id: 'photos', label: 'Photos disponibles', type: 'file-or-link' },
      { id: 'videos', label: 'Vidéos disponibles', type: 'file-or-link' },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true },
    ],
  },
];

const ADS_STEPS: FormStep[] = [
  {
    title: 'Informations générales',
    fields: [
      { id: 'company_name', label: "Nom de l'entreprise", type: 'text' },
      { id: 'contact_name', label: 'Nom du contact', type: 'text' },
      { id: 'email', label: 'Email', type: 'email' },
      { id: 'phone', label: 'Téléphone', type: 'tel' },
      { id: 'whatsapp', label: 'WhatsApp', type: 'tel' },
      { id: 'website', label: 'Site web', type: 'text', optional: true },
      { id: 'landing_page', label: 'Landing page', type: 'text', optional: true },
    ],
  },
  {
    title: 'Activité',
    skipCheckbox: 'Informations déjà partagées',
    fields: [
      { id: 'activity_type', label: "Type d'activité", type: 'text' },
      { id: 'services', label: 'Services proposés', type: 'textarea' },
      { id: 'avg_price', label: 'Prix moyen', type: 'text' },
      { id: 'main_offer', label: 'Offre principale', type: 'textarea' },
      { id: 'main_advantage', label: 'Avantage principal', type: 'text' },
      { id: 'client_guarantee', label: 'Garantie client', type: 'text' },
    ],
  },
  {
    title: 'Offre à promouvoir',
    fields: [
      { id: 'promoted_offer', label: 'Offre principale à promouvoir', type: 'textarea' },
      { id: 'main_message', label: 'Message principal', type: 'textarea' },
      { id: 'current_promo', label: 'Promotion actuelle', type: 'text', optional: true },
      { id: 'special_offer', label: 'Offre spéciale', type: 'text', optional: true },
      { id: 'why_choose', label: 'Pourquoi un client doit vous choisir', type: 'textarea' },
    ],
  },
  {
    title: 'Zone',
    fields: [
      { id: 'main_city', label: 'Ville principale', type: 'text' },
      { id: 'served_areas', label: 'Zones desservies', type: 'textarea' },
      { id: 'max_distance', label: 'Distance maximale', type: 'text' },
      { id: 'most_profitable_area', label: 'Zone la plus rentable', type: 'text' },
    ],
  },
  {
    title: 'Client cible',
    fields: [
      { id: 'client_type', label: 'Type de clients', type: 'radio', options: ['Particuliers', 'Entreprises', 'Les deux'] },
      { id: 'ideal_client', label: 'Type de client idéal', type: 'textarea' },
      { id: 'min_budget', label: 'Budget minimum', type: 'text' },
      { id: 'request_type', label: 'Type de demande souhaitée', type: 'text' },
      { id: 'avoid_clients', label: 'Clients à éviter', type: 'textarea', optional: true },
    ],
  },
  {
    title: 'Objectifs',
    fields: [
      { id: 'main_objective', label: 'Objectif principal', type: 'radio', options: ['Leads', 'Clients', "Chiffre d'affaires"] },
      { id: 'monthly_leads', label: 'Leads souhaités par mois', type: 'text' },
      { id: 'monthly_clients', label: 'Clients souhaités par mois', type: 'text' },
      { id: 'monthly_budget', label: 'Budget publicité mensuel', type: 'text' },
    ],
  },
  {
    title: 'Gestion des leads',
    fields: [
      { id: 'who_responds', label: 'Qui répond aux leads', type: 'text' },
      { id: 'response_time', label: 'Temps de réponse', type: 'text' },
      { id: 'main_contact_method', label: 'Contact principal', type: 'radio', options: ['Appel', 'WhatsApp', 'Email'] },
      { id: 'availability', label: 'Disponibilité', type: 'text' },
    ],
  },
  {
    title: 'Contenu marketing',
    skipCheckbox: 'Ressources déjà envoyées',
    fields: [
      { id: 'photos', label: 'Photos disponibles', type: 'file-or-link' },
      { id: 'videos', label: 'Vidéos disponibles', type: 'file-or-link' },
      { id: 'testimonials', label: 'Témoignages disponibles', type: 'file-or-link' },
      { id: 'logo', label: 'Logo disponible', type: 'file-or-link' },
      { id: 'commercial_docs', label: 'Documents commerciaux', type: 'file-or-link', optional: true },
    ],
  },
  {
    title: 'Accès techniques',
    skipCheckbox: 'Accès déjà partagés',
    fields: [
      { id: 'fb_business_manager', label: 'Facebook Business Manager', type: 'textarea' },
      { id: 'fb_page', label: 'Page Facebook', type: 'text' },
      { id: 'ad_account', label: 'Compte publicitaire', type: 'text' },
      { id: 'pixel', label: 'Pixel', type: 'text' },
      { id: 'site_access', label: 'Accès site web', type: 'textarea', optional: true },
      { id: 'domain_access', label: 'Accès domaine', type: 'textarea', optional: true },
      { id: 'landing_access', label: 'Accès landing page', type: 'textarea', optional: true },
      { id: 'google_analytics', label: 'Google Analytics', type: 'text', optional: true },
      { id: 'google_tag_manager', label: 'Google Tag Manager', type: 'text', optional: true },
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
              Certaines informations peuvent déjà avoir été partagées avec nous. Si c'est le cas, vous pouvez simplement cocher <em>"information déjà partagée"</em> et passer à l'étape suivante.
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

          {/* Skip checkbox */}
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
                  <div className="mt-1.5">
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
              ✅ Section validée — les informations ont déjà été partagées.
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
