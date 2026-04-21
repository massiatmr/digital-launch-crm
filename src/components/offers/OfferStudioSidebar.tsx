import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Eye, EyeOff, Trash2, Save, Upload, Loader2, Tag, DollarSign } from 'lucide-react';
import { useUpdateOffer, useUpdateOfferPage, type DbOffer, type DbOfferPage } from '@/hooks/useOfferData';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const SECTION_LABELS: Record<string, string> = {
  pain_points: 'Points de douleur',
  transformation: 'Transformation Avant/Après',
  deliverables: 'Ce qui est inclus',
  bonuses: 'Bonus',
  solution: 'Solution',
  guarantee: 'Garantie',
  faq: 'FAQ',
  portfolio: 'Réalisations',
  pricing: 'Tarifs',
};

interface Props {
  offer: DbOffer;
  page: DbOfferPage;
}

export default function OfferStudioSidebar({ offer, page }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const updateOffer = useUpdateOffer();
  const updatePage = useUpdateOfferPage();

  const [name, setName] = useState(offer.name);
  const [niche, setNiche] = useState(offer.niche || '');
  const [description, setDescription] = useState(offer.description || '');
  const [headline, setHeadline] = useState(page.headline);
  const [subheadline, setSubheadline] = useState(page.subheadline);
  const [ctaText, setCtaText] = useState(page.cta_text);
  const [showPrice, setShowPrice] = useState((offer as any).show_price || false);
  const [price, setPrice] = useState(offer.price || '');
  const [uploading, setUploading] = useState(false);

  const sections: any[] = Array.isArray(page.sections) ? page.sections : [];

  useEffect(() => {
    setName(offer.name); setNiche(offer.niche || ''); setDescription(offer.description || '');
    setShowPrice((offer as any).show_price || false); setPrice(offer.price || '');
  }, [offer.id, offer.updated_at]);

  useEffect(() => {
    setHeadline(page.headline); setSubheadline(page.subheadline); setCtaText(page.cta_text);
  }, [page.id, page.updated_at]);

  const saveOffer = async () => {
    await updateOffer.mutateAsync({ id: offer.id, name, niche, description, show_price: showPrice, price });
    toast.success('Infos enregistrées');
  };

  const savePage = async () => {
    await updatePage.mutateAsync({ id: page.id, headline, subheadline, cta_text: ctaText });
    toast.success('Hero enregistré');
  };

  const updateSections = async (newSections: any[]) => {
    await updatePage.mutateAsync({ id: page.id, sections: newSections });
    qc.invalidateQueries({ queryKey: ['offer_pages', offer.id] });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const next = [...sections];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    updateSections(next);
  };

  const toggleSection = (idx: number) => {
    const next = sections.map((s, i) => i === idx ? { ...s, hidden: !s.hidden } : s);
    updateSections(next);
  };

  const deleteSection = (idx: number) => {
    if (!confirm('Supprimer cette section ?')) return;
    updateSections(sections.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    const next = sections.map((s, i) => i === idx ? { ...s, title } : s);
    updateSections(next);
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${offer.id}-hero-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('offer-assets').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('offer-assets').getPublicUrl(path);
      await updateOffer.mutateAsync({ id: offer.id, hero_image_url: pub.publicUrl });
      toast.success('Image hero mise à jour');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      {/* Identité */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Identité
        </h3>
        <div>
          <Label className="text-xs">Nom de l'offre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveOffer} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Niche</Label>
          <Input value={niche} onChange={(e) => setNiche(e.target.value)} onBlur={saveOffer} placeholder="Ex: Déménageurs" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Description courte</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveOffer} rows={2} className="mt-1 resize-none" />
        </div>
      </section>

      {/* Hero */}
      <section className="space-y-3 pt-3 border-t border-border/50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hero (haut de page)</h3>
        <div>
          <Label className="text-xs">Titre principal</Label>
          <Textarea value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={savePage} rows={2} className="mt-1 resize-none" />
        </div>
        <div>
          <Label className="text-xs">Sous-titre</Label>
          <Textarea value={subheadline} onChange={(e) => setSubheadline(e.target.value)} onBlur={savePage} rows={2} className="mt-1 resize-none" />
        </div>
        <div>
          <Label className="text-xs">Texte du bouton CTA</Label>
          <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} onBlur={savePage} placeholder="Réserver un appel" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Image hero</Label>
          <div className="mt-1 flex items-center gap-2">
            {(offer as any).hero_image_url && (
              <img src={(offer as any).hero_image_url} alt="" className="h-12 w-12 rounded object-cover border border-border" />
            )}
            <label className="flex-1">
              <input type="file" accept="image/*" onChange={handleHeroUpload} className="hidden" />
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border hover:border-primary/50 cursor-pointer text-xs text-muted-foreground hover:text-primary transition-colors">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {(offer as any).hero_image_url ? 'Remplacer' : 'Uploader'}
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Prix */}
      <section className="space-y-3 pt-3 border-t border-border/50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <DollarSign className="h-3 w-3" /> Prix
        </h3>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
          <div>
            <p className="text-sm font-medium">Afficher le prix</p>
            <p className="text-xs text-muted-foreground">Désactivé : "Réserver un appel"</p>
          </div>
          <Switch checked={showPrice} onCheckedChange={(v) => { setShowPrice(v); updateOffer.mutate({ id: offer.id, show_price: v }); }} />
        </div>
        {showPrice && (
          <div>
            <Label className="text-xs">Prix affiché</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={saveOffer} placeholder="Ex: à partir de 997€" className="mt-1" />
          </div>
        )}
      </section>

      {/* Sections */}
      <section className="space-y-3 pt-3 border-t border-border/50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sections ({sections.length})</h3>
        {sections.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Demande à l'IA d'ajouter des sections</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s, idx) => (
              <div key={idx} className={`group p-2.5 rounded-lg border ${s.hidden ? 'border-border/30 bg-muted/20 opacity-60' : 'border-border/60 bg-muted/40'} hover:border-primary/30 transition-colors`}>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-0.5 hover:text-primary disabled:opacity-30">
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">{SECTION_LABELS[s.type] || s.type}</Badge>
                  <div className="flex-1" />
                  <button onClick={() => toggleSection(idx)} className="p-1 hover:text-primary" title={s.hidden ? 'Afficher' : 'Masquer'}>
                    {s.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => deleteSection(idx)} className="p-1 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  value={s.title || ''}
                  onChange={(e) => {
                    const next = sections.map((sec, i) => i === idx ? { ...sec, title: e.target.value } : sec);
                    updateSections(next);
                  }}
                  placeholder="Titre de la section"
                  className="mt-1.5 text-xs h-7"
                />
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>{Array.isArray(s.items) ? `${s.items.length} éléments` : (s.before ? 'Avant/Après' : '—')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
