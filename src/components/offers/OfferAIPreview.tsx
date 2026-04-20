import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Sparkles, ArrowLeft, Check, Shield, Star, Loader2,
  AlertTriangle, Clock, TrendingDown, Frown, Zap,
  Rocket, Target, Gift, Trophy, Gem, type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const ICONS: Record<string, LucideIcon> = {
  AlertTriangle, Clock, TrendingDown, Frown, Zap,
  Rocket, Target, Gift, Shield, Star, Trophy, Gem,
};

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] || Sparkles;
  return <C className={className} />;
}

export interface GeneratedOffer {
  name: string;
  headline: string;
  subheadline: string;
  price_anchor: string;
  price_final: string;
  pain_points: { icon: string; title: string; description: string }[];
  transformation: { before: string; after: string };
  deliverables: { icon: string; title: string; description: string; value: string }[];
  bonuses: { title: string; description: string; value: string }[];
  guarantee: { title: string; description: string };
  faq: { question: string; answer: string }[];
  cta_text: string;
  image_prompt: string;
}

interface Props {
  generated: { offer: GeneratedOffer; cover_image_url: string | null };
  brief: { target: string; problem: string; transformation: string; price: string; niche: string };
  onCancel: () => void;
  onCreated: (offerId: string) => void;
}

function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function OfferAIPreview({ generated, brief, onCancel, onCreated }: Props) {
  const wsId = useCurrentWorkspaceId();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { offer, cover_image_url } = generated;

  const handleSave = async () => {
    setSaving(true);
    try {
      const baseSlug = slugify(offer.name);
      const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

      // Insert offer
      const { data: offerRow, error: offerErr } = await supabase
        .from('offers')
        .insert({
          name: offer.name,
          slug,
          description: offer.subheadline,
          price: offer.price_final,
          niche: brief.niche || null,
          features: offer.deliverables.map((d) => ({ label: d.title, description: d.description })) as any,
          cover_image_url: cover_image_url || null,
          ...(wsId ? { workspace_id: wsId } : {}),
        } as any)
        .select()
        .single();
      if (offerErr) throw offerErr;

      // Insert offer_page with full Hormozi structure
      const sections = [
        {
          type: 'pain_points',
          title: 'Reconnais-tu ces situations ?',
          variant: 'hormozi',
          items: offer.pain_points,
        },
        {
          type: 'transformation',
          before: offer.transformation.before,
          after: offer.transformation.after,
        },
        {
          type: 'deliverables',
          title: 'Tout ce que tu obtiens',
          items: offer.deliverables,
          total_value: offer.deliverables.reduce((sum, d) => {
            const n = parseInt(d.value.replace(/[^0-9]/g, ''), 10);
            return sum + (isNaN(n) ? 0 : n);
          }, 0),
        },
        {
          type: 'bonuses',
          title: 'Bonus exclusifs',
          items: offer.bonuses,
        },
        {
          type: 'guarantee',
          title: offer.guarantee.title,
          description: offer.guarantee.description,
        },
        {
          type: 'faq',
          title: 'Questions fréquentes',
          items: offer.faq,
        },
        {
          type: 'pricing',
          anchor: offer.price_anchor,
          final: offer.price_final,
        },
      ];

      const { error: pageErr } = await supabase.from('offer_pages').insert({
        offer_id: offerRow.id,
        headline: offer.headline,
        subheadline: offer.subheadline,
        cta_text: offer.cta_text,
        sections: sections as any,
      } as any);
      if (pageErr) throw pageErr;

      qc.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offre créée avec succès 🎉');
      onCreated(offerRow.id);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erreur à la création');
    } finally {
      setSaving(false);
    }
  };

  const totalValue = offer.deliverables.reduce((sum, d) => {
    const n = parseInt(d.value.replace(/[^0-9]/g, ''), 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium truncate">Aperçu : {offer.name}</span>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Modifier
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Création…</> : <>Créer l'offre</>}
          </Button>
        </div>
      </div>

      {/* Preview body — looks like the public landing */}
      <div className="flex-1 overflow-y-auto bg-[#0a0a0f] text-white">
        {/* Hero */}
        <section className="relative px-6 py-10">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent pointer-events-none" />
          <div className="relative space-y-4">
            {brief.niche && (
              <Badge className="bg-primary/20 text-primary border-primary/30">{brief.niche}</Badge>
            )}
            <h1 className="text-3xl font-black leading-tight">{offer.headline}</h1>
            <p className="text-gray-400">{offer.subheadline}</p>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 line-through text-sm">{offer.price_anchor}</span>
              <span className="text-2xl font-bold text-primary">{offer.price_final}</span>
            </div>
            {cover_image_url && (
              <img
                src={cover_image_url}
                alt="hero"
                className="w-full rounded-xl border border-white/10 mt-4"
              />
            )}
          </div>
        </section>

        {/* Pain points */}
        <section className="px-6 py-8 border-t border-white/5">
          <h2 className="text-xl font-bold mb-4">Reconnais-tu ces situations ?</h2>
          <div className="space-y-3">
            {offer.pain_points.map((p, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                <Icon name={p.icon} className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">{p.title}</p>
                  <p className="text-sm text-gray-400">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Before / After */}
        <section className="px-6 py-8 border-t border-white/5 grid grid-cols-2 gap-3">
          <Card className="bg-red-950/20 border-red-900/30 p-4">
            <p className="text-xs text-red-400 mb-1">AVANT</p>
            <p className="text-sm text-gray-300">{offer.transformation.before}</p>
          </Card>
          <Card className="bg-emerald-950/20 border-emerald-900/30 p-4">
            <p className="text-xs text-emerald-400 mb-1">APRÈS</p>
            <p className="text-sm text-gray-300">{offer.transformation.after}</p>
          </Card>
        </section>

        {/* Deliverables / value stack */}
        <section className="px-6 py-8 border-t border-white/5">
          <h2 className="text-xl font-bold mb-4">Tout ce que tu obtiens</h2>
          <div className="space-y-3">
            {offer.deliverables.map((d, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                <Icon name={d.icon} className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-sm">{d.title}</p>
                    <span className="text-xs text-emerald-400 shrink-0">{d.value}</span>
                  </div>
                  <p className="text-sm text-gray-400">{d.description}</p>
                </div>
              </div>
            ))}
          </div>
          {totalValue > 0 && (
            <p className="text-right mt-3 text-sm text-gray-400">
              Valeur totale : <span className="font-bold text-white">{totalValue}€</span>
            </p>
          )}
        </section>

        {/* Bonuses */}
        {offer.bonuses.length > 0 && (
          <section className="px-6 py-8 border-t border-white/5">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Gift className="h-5 w-5 text-yellow-400" /> Bonus exclusifs
            </h2>
            <div className="space-y-3">
              {offer.bonuses.map((b, i) => (
                <div key={i} className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-sm">🎁 {b.title}</p>
                    <span className="text-xs text-yellow-400 shrink-0">{b.value}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{b.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Guarantee */}
        <section className="px-6 py-8 border-t border-white/5">
          <Card className="bg-emerald-950/20 border-emerald-500/30 p-5 text-center">
            <Shield className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
            <h3 className="font-bold text-lg">{offer.guarantee.title}</h3>
            <p className="text-sm text-gray-400 mt-2">{offer.guarantee.description}</p>
          </Card>
        </section>

        {/* FAQ */}
        <section className="px-6 py-8 border-t border-white/5">
          <h2 className="text-xl font-bold mb-4">Questions fréquentes</h2>
          <div className="space-y-3">
            {offer.faq.map((f, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="font-semibold text-sm">{f.question}</p>
                <p className="text-sm text-gray-400 mt-1">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-8 border-t border-white/5 text-center">
          <Button size="lg" className="bg-primary text-primary-foreground rounded-full px-8">
            {offer.cta_text}
          </Button>
        </section>
      </div>
    </div>
  );
}
