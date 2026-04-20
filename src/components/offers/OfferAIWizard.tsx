import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerProfile } from '@/hooks/useOwnerProfile';
import { toast } from 'sonner';
import OfferAIPreview, { GeneratedOffer } from './OfferAIPreview';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (offerId: string) => void;
}

const STEPS = [
  { key: 'target', label: 'Cible' },
  { key: 'problem', label: 'Douleur' },
  { key: 'transformation', label: 'Promesse' },
  { key: 'price', label: 'Prix' },
  { key: 'niche', label: 'Niche' },
] as const;

export default function OfferAIWizard({ open, onOpenChange, onCreated }: Props) {
  const { data: profile } = useOwnerProfile();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<{ offer: GeneratedOffer; cover_image_url: string | null } | null>(null);
  const [form, setForm] = useState({
    target: '',
    problem: '',
    transformation: '',
    price: '',
    niche: '',
  });

  const reset = () => {
    setStep(0);
    setForm({ target: '', problem: '', transformation: '', price: '', niche: '' });
    setGenerated(null);
    setLoading(false);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const canNext = () => {
    const k = STEPS[step].key;
    if (k === 'niche') return true;
    return (form as any)[k]?.trim().length > 0;
  };

  const handleGenerate = async () => {
    if (!form.target || !form.problem || !form.transformation) {
      toast.error('Réponds aux questions essentielles');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-offer', {
        body: {
          ...form,
          brand_color: profile?.brand_color || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGenerated(data);
      toast.success('Offre générée ✨');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erreur de génération');
    } finally {
      setLoading(false);
    }
  };

  // Preview mode
  if (generated) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
          <OfferAIPreview
            generated={generated}
            brief={form}
            onCancel={() => setGenerated(null)}
            onCreated={(id) => {
              onCreated?.(id);
              close();
            }}
          />
        </SheetContent>
      </Sheet>
    );
  }

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Créer une offre irrésistible
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Méthode Alex Hormozi · 5 questions, l'IA fait le reste
          </p>
        </SheetHeader>

        <div className="mt-4">
          <Progress value={progress} className="h-1" />
          <p className="text-xs text-muted-foreground mt-2">
            Étape {step + 1} / {STEPS.length} · {current.label}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-6 space-y-4">
          {current.key === 'target' && (
            <div className="space-y-2">
              <Label>Qui est ta cible idéale ?</Label>
              <Input
                autoFocus
                placeholder="Ex: Déménageurs PME en France, 5-20 employés"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Sois précis : métier, taille, zone géographique.</p>
            </div>
          )}

          {current.key === 'problem' && (
            <div className="space-y-2">
              <Label>Quel est leur problème n°1 ?</Label>
              <Textarea
                autoFocus
                rows={4}
                placeholder="Ex: Ils perdent 60% des leads parce qu'ils répondent trop tard aux demandes de devis"
                value={form.problem}
                onChange={(e) => setForm({ ...form, problem: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">La douleur viscérale qui les empêche de dormir.</p>
            </div>
          )}

          {current.key === 'transformation' && (
            <div className="space-y-2">
              <Label>Quelle transformation tu promets ?</Label>
              <Textarea
                autoFocus
                rows={4}
                placeholder="Ex: Doubler leur taux de conversion en 30 jours grâce à un suivi automatisé"
                value={form.transformation}
                onChange={(e) => setForm({ ...form, transformation: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Le résultat concret et mesurable.</p>
            </div>
          )}

          {current.key === 'price' && (
            <div className="space-y-2">
              <Label>Prix final de l'offre</Label>
              <Input
                autoFocus
                placeholder="Ex: 997€ ou 1500€/mois"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">L'IA proposera un prix barré "ancre" plus élevé.</p>
            </div>
          )}

          {current.key === 'niche' && (
            <div className="space-y-2">
              <Label>Niche / catégorie (optionnel)</Label>
              <Input
                autoFocus
                placeholder="Ex: Déménageurs"
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Affiché en badge sur la landing.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || loading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
              Suivant <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-2" /> Générer l'offre</>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
