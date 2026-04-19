import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useOwnerProfile, useUpdateOwnerProfile } from '@/hooks/useOwnerProfile';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

export default function OnboardingWizardPage() {
  const { user, loading } = useAuth();
  const { data: profile, isLoading } = useOwnerProfile();
  const update = useUpdateOwnerProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    company_name: '',
    legal_name: '',
    siret: '',
    vat_number: '',
    address: '',
    phone: '',
    slug: '',
    email_sender_name: '',
    email_signature: '',
  });

  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        company_name: profile.company_name || '',
        legal_name: profile.legal_name || '',
        siret: profile.siret || '',
        vat_number: profile.vat_number || '',
        address: profile.address || '',
        phone: profile.phone || '',
        slug: profile.slug || '',
        email_sender_name: profile.email_sender_name || '',
        email_signature: profile.email_signature || '',
      }));
    }
  }, [profile]);

  if (loading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.onboarding_completed) return <Navigate to="/" replace />;

  const STEPS = ['Entreprise', 'Identité publique', 'Emails', 'Terminé'] as const;
  const progress = ((step + 1) / STEPS.length) * 100;

  const setField = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === 'company_name' && !f.slug ? { slug: slugify(v) } : {}) }));

  const next = async () => {
    if (step === 0 && !form.company_name.trim()) {
      toast.error('Le nom de ton entreprise est requis');
      return;
    }
    if (step === 1 && !form.slug.trim()) {
      toast.error('Un identifiant public (slug) est requis');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = async () => {
    try {
      await update.mutateAsync({ ...form, onboarding_completed: true } as any);
      toast.success('Bienvenue ! Ton CRM est prêt.');
      navigate('/');
    } catch (e: any) {
      toast.error(e?.message?.includes('duplicate') ? 'Cet identifiant public est déjà pris' : 'Erreur lors de la sauvegarde');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-6 sm:p-8 space-y-6 bg-card/50 backdrop-blur border-white/10">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Étape {step + 1} sur {STEPS.length} — {STEPS[step]}
          </p>
          <Progress value={progress} className="h-1" />
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Bienvenue sur ton CRM 👋</h2>
              <p className="text-sm text-muted-foreground mt-1">Configurons ton entreprise pour personnaliser tes documents et pages publiques.</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nom de l'entreprise *</Label>
                <Input value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} placeholder="Acme Studio" />
              </div>
              <div>
                <Label>Raison sociale (optionnel)</Label>
                <Input value={form.legal_name} onChange={(e) => setField('legal_name', e.target.value)} placeholder="Acme Studio SAS" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SIRET</Label>
                  <Input value={form.siret} onChange={(e) => setField('siret', e.target.value)} />
                </div>
                <div>
                  <Label>N° TVA</Label>
                  <Input value={form.vat_number} onChange={(e) => setField('vat_number', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Adresse</Label>
                <Textarea rows={2} value={form.address} onChange={(e) => setField('address', e.target.value)} />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Ton identifiant public</h2>
              <p className="text-sm text-muted-foreground mt-1">Utilisé dans les URLs de tes pages publiques (offres, signatures…).</p>
            </div>
            <div>
              <Label>Identifiant (slug) *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setField('slug', slugify(e.target.value))}
                placeholder="acme-studio"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tes offres seront accessibles sur <code className="text-primary">/o/{form.slug || 'mon-slug'}/...</code>
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Personnalise tes emails</h2>
              <p className="text-sm text-muted-foreground mt-1">Ces infos apparaîtront dans les emails envoyés à tes prospects et clients.</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nom d'expéditeur</Label>
                <Input value={form.email_sender_name} onChange={(e) => setField('email_sender_name', e.target.value)} placeholder="Acme Studio" />
              </div>
              <div>
                <Label>Signature email</Label>
                <Textarea rows={3} value={form.email_signature} onChange={(e) => setField('email_signature', e.target.value)} placeholder="L'équipe Acme — contact@acme.com" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Tout est prêt !</h2>
            <p className="text-sm text-muted-foreground">Tu pourras configurer WhatsApp, Meta et Google Calendar plus tard depuis les paramètres.</p>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continuer <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Lancer mon CRM
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
