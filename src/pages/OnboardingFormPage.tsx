import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react';
import type { ErrorInfo } from 'react';
import { X } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Loader2, Download } from 'lucide-react';
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
import { WEBSITE_STEPS, ADS_STEPS, type FormField, type FormStep } from '@/lib/onboardingSteps';
import { generateOnboardingPDF } from '@/lib/generateOnboardingPDF';


class OnboardingErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Onboarding form error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="p-8 text-center max-w-md space-y-4">
            <p className="text-lg font-semibold">Une erreur est survenue</p>
            <p className="text-sm text-muted-foreground">Veuillez rafraîchir la page pour continuer. Vos réponses ont été sauvegardées automatiquement.</p>
            <Button onClick={() => window.location.reload()}>Rafraîchir la page</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

function FileOrLinkField({ id, value, onChange, clientId, token }: { id: string; value: any; onChange: (v: any) => void; clientId: string; token: string }) {
  const [mode, setMode] = useState<'link' | 'file'>(() => {
    if (Array.isArray(value?.files) && value.files.length > 0) return 'file';
    return value?.mode || 'link';
  });
  const [uploading, setUploading] = useState(false);

  const files: { url: string; name: string }[] = Array.isArray(value?.files) ? value.files : 
    (value?.mode === 'file' && value?.url ? [{ url: value.url, name: value.name }] : []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setUploading(true);
    const newFiles = [...files];
    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-onboarding-file`;
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      const formData = new FormData();
      formData.append('token', token);
      formData.append('client_id', clientId);
      formData.append('file', file);
      try {
        const res = await fetch(baseUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) { toast.error(`Erreur upload: ${file.name}`); continue; }
        newFiles.push({ url: data.url, name: data.name });
      } catch { toast.error(`Erreur upload: ${file.name}`); }
    }
    onChange({ mode: 'file', files: newFiles });
    setUploading(false);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    const newFiles = files.filter((_, i) => i !== idx);
    onChange(newFiles.length > 0 ? { mode: 'file', files: newFiles } : '');
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
        <div className="space-y-2">
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-primary/10 rounded-lg px-3 py-1.5">
                  <span className="text-primary truncate flex-1">✅ {f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Upload en cours...</div>
          ) : (
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm hover:bg-muted/50 transition-colors">
              <input type="file" className="hidden" multiple onChange={handleFiles} />
              {files.length > 0 ? 'Ajouter d\'autres fichiers' : 'Choisir des fichiers'}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function OnboardingFormContent() {
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

  const initializedRef = useRef(false);
  useEffect(() => {
    if (onboarding?.completed) {
      setCompleted(true);
      return;
    }
    if (initializedRef.current) return;
    if (onboarding?.responses && Object.keys(onboarding.responses as Record<string, any>).length > 0) {
      setResponses(onboarding.responses as Record<string, any>);
      const resp = onboarding.responses as Record<string, any>;
      if (resp._skippedSteps) {
        setSkippedSteps(resp._skippedSteps);
      }
      initializedRef.current = true;
    }
  }, [onboarding]);

  const autoSave = useCallback(() => {
    if (!token || saveResponses.isPending) return;
    try {
      const allData = { ...responses, _skippedSteps: skippedSteps };
      saveResponses.mutate({ token, responses: allData });
    } catch (e) {
      console.error('Auto-save error:', e);
    }
  }, [token, responses, skippedSteps, saveResponses]);

  useEffect(() => {
    if (!initializedRef.current) return;
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

  const handleDownloadPDF = async () => {
    try {
      const allData = { ...responses, _skippedSteps: skippedSteps };
      const pdf = await generateOnboardingPDF({
        formType: formTypeFromUrl as 'website' | 'ads',
        steps,
        responses: allData,
        companyName: onboarding?.clients?.company_name,
        completedAt: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
      });
      const fileName = `onboarding-${formTypeFromUrl}-${(onboarding?.clients?.company_name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error('PDF generation error:', e);
      toast.error('Erreur lors de la génération du PDF');
    }
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
    if (typeof val === 'object' && val !== null) {
      if (Array.isArray(val.files)) return val.files.length > 0;
      return !!val.url;
    }
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
                          token={token || ''}
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

export default function OnboardingFormPage() {
  return (
    <OnboardingErrorBoundary>
      <OnboardingFormContent />
    </OnboardingErrorBoundary>
  );
}
