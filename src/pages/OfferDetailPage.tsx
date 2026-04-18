import { useParams, Link } from 'react-router-dom';
import { useSmartBack } from '@/hooks/useSmartBack';
import { useOffer, useUpdateOffer, useOfferPage, useUpdateOfferPage, useBookings } from '@/hooks/useOfferData';
import { useLeads } from '@/hooks/useLeadData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Users, CalendarCheck, Loader2, Save, Plus, Trash2, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

type SectionItem = {
  type: 'pain_points' | 'solution' | 'guarantee' | 'portfolio';
  title: string;
  description?: string;
  items?: any[];
};

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: offer, isLoading } = useOffer(id);
  const { data: offerPage } = useOfferPage(id);
  const { data: leads } = useLeads();
  const { data: bookings } = useBookings();
  const updateOffer = useUpdateOffer();
  const updatePage = useUpdateOfferPage();

  const [form, setForm] = useState({ name: '', description: '', price: '', niche: '', is_active: true });
  const [pageForm, setPageForm] = useState({ headline: '', subheadline: '', cta_text: '' });
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);

  useEffect(() => {
    if (offer) setForm({ name: offer.name, description: offer.description || '', price: offer.price || '', niche: offer.niche || '', is_active: offer.is_active });
  }, [offer]);

  useEffect(() => {
    if (offerPage) {
      setPageForm({ headline: offerPage.headline, subheadline: offerPage.subheadline, cta_text: offerPage.cta_text });
      setSections(Array.isArray(offerPage.sections) ? offerPage.sections : []);
      setTestimonials(Array.isArray(offerPage.testimonials) ? offerPage.testimonials : []);
    }
  }, [offerPage]);

  const handleSaveOffer = async () => {
    if (!id) return;
    await updateOffer.mutateAsync({ id, ...form });
    toast.success('Offre mise à jour');
  };

  const handleSavePage = async () => {
    if (!offerPage) return;
    await updatePage.mutateAsync({ id: offerPage.id, ...pageForm, sections, testimonials });
    toast.success('Page mise à jour');
  };

  // Section helpers
  const getSection = (type: string) => sections.find(s => s.type === type);
  const updateSection = (type: string, updates: Partial<SectionItem>) => {
    setSections(prev => {
      const exists = prev.find(s => s.type === type);
      if (exists) return prev.map(s => s.type === type ? { ...s, ...updates } : s);
      return [...prev, { type: type as SectionItem['type'], title: '', items: [], ...updates }];
    });
  };
  const addSectionItem = (type: string, item: any) => {
    const section = getSection(type);
    const items = [...(section?.items || []), item];
    updateSection(type, { items });
  };
  const removeSectionItem = (type: string, index: number) => {
    const section = getSection(type);
    const items = (section?.items || []).filter((_: any, i: number) => i !== index);
    updateSection(type, { items });
  };
  const updateSectionItem = (type: string, index: number, value: any) => {
    const section = getSection(type);
    const items = (section?.items || []).map((it: any, i: number) => i === index ? value : it);
    updateSection(type, { items });
  };

  const offerLeads = leads?.filter(l => (l as any).offer_id === id) || [];
  const offerBookings = bookings?.filter(b => b.offer_id === id) || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!offer) return <div className="text-center py-16 text-muted-foreground">Offre introuvable</div>;

  const painPoints = getSection('pain_points');
  const solution = getSection('solution');
  const guarantee = getSection('guarantee');
  const portfolio = getSection('portfolio');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/offers"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{offer.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {offer.niche && <Badge variant="secondary">{offer.niche}</Badge>}
            <Badge variant={offer.is_active ? 'default' : 'outline'}>{offer.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        {offer.is_active && (
          <Link to={`/offers/${offer.slug}/page`} target="_blank">
            <Button variant="outline"><ExternalLink className="h-4 w-4 mr-2" />Voir la page</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-4 flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><div><p className="text-2xl font-bold">{offerLeads.length}</p><p className="text-xs text-muted-foreground">Leads</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><CalendarCheck className="h-5 w-5 text-accent" /><div><p className="text-2xl font-bold">{offerBookings.length}</p><p className="text-xs text-muted-foreground">RDV</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="page">Landing Page</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="testimonials">Témoignages</TabsTrigger>
          <TabsTrigger value="leads">Leads ({offerLeads.length})</TabsTrigger>
          <TabsTrigger value="bookings">RDV ({offerBookings.length})</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Informations de l'offre</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Nom</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Prix</Label><Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                <div><Label>Niche</Label><Input value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSaveOffer} disabled={updateOffer.isPending}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Landing page tab */}
        <TabsContent value="page">
          <Card>
            <CardHeader><CardTitle>Landing Page</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre principal (Hero)</Label><Input value={pageForm.headline} onChange={e => setPageForm(f => ({ ...f, headline: e.target.value }))} /></div>
              <div><Label>Sous-titre</Label><Textarea value={pageForm.subheadline} onChange={e => setPageForm(f => ({ ...f, subheadline: e.target.value }))} /></div>
              <div><Label>Texte du bouton CTA</Label><Input value={pageForm.cta_text} onChange={e => setPageForm(f => ({ ...f, cta_text: e.target.value }))} /></div>
              <Button onClick={handleSavePage} disabled={updatePage.isPending}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sections tab */}
        <TabsContent value="sections" className="space-y-6">
          {/* Pain Points */}
          <Card>
            <CardHeader><CardTitle>Points de douleur</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre de la section</Label><Input value={painPoints?.title || ''} onChange={e => updateSection('pain_points', { title: e.target.value })} placeholder="Est-ce que cela vous ressemble ?" /></div>
              <Label>Points de douleur</Label>
              {(painPoints?.items || []).map((item: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input value={item} onChange={e => updateSectionItem('pain_points', i, e.target.value)} />
                  <Button variant="ghost" size="icon" onClick={() => removeSectionItem('pain_points', i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addSectionItem('pain_points', '')}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
            </CardContent>
          </Card>

          {/* Solution */}
          <Card>
            <CardHeader><CardTitle>Solution / Proposition</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre</Label><Input value={solution?.title || ''} onChange={e => updateSection('solution', { title: e.target.value })} placeholder="Et bien c'est votre jour de chance !" /></div>
              <div><Label>Description</Label><Textarea value={solution?.description || ''} onChange={e => updateSection('solution', { description: e.target.value })} /></div>
              <Label>Arguments</Label>
              {(solution?.items || []).map((item: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input value={item} onChange={e => updateSectionItem('solution', i, e.target.value)} />
                  <Button variant="ghost" size="icon" onClick={() => removeSectionItem('solution', i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addSectionItem('solution', '')}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
            </CardContent>
          </Card>

          {/* Guarantee */}
          <Card>
            <CardHeader><CardTitle>Garantie</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre</Label><Input value={guarantee?.title || ''} onChange={e => updateSection('guarantee', { title: e.target.value })} placeholder="Garantie de remboursement à 100%" /></div>
              <div><Label>Description</Label><Textarea value={guarantee?.description || ''} onChange={e => updateSection('guarantee', { description: e.target.value })} placeholder="Aucun risque pour vous. Tout le risque est sur nous." /></div>
            </CardContent>
          </Card>

          {/* Portfolio */}
          <Card>
            <CardHeader><CardTitle>Portfolio / Réalisations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre de la section</Label><Input value={portfolio?.title || ''} onChange={e => updateSection('portfolio', { title: e.target.value })} placeholder="Nos Réalisations" /></div>
              {(portfolio?.items || []).map((item: any, i: number) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={item.title || ''} onChange={e => updateSectionItem('portfolio', i, { ...item, title: e.target.value })} placeholder="Titre du projet" />
                    <Button variant="ghost" size="icon" onClick={() => removeSectionItem('portfolio', i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Input value={item.image || ''} onChange={e => updateSectionItem('portfolio', i, { ...item, image: e.target.value })} placeholder="URL de l'image" />
                  <Input value={item.description || ''} onChange={e => updateSectionItem('portfolio', i, { ...item, description: e.target.value })} placeholder="Description" />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addSectionItem('portfolio', { title: '', image: '', description: '' })}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
            </CardContent>
          </Card>

          <Button onClick={handleSavePage} disabled={updatePage.isPending} size="lg" className="w-full">
            <Save className="h-4 w-4 mr-2" />Enregistrer toutes les sections
          </Button>
        </TabsContent>

        {/* Testimonials tab */}
        <TabsContent value="testimonials">
          <Card>
            <CardHeader><CardTitle>Témoignages clients</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {testimonials.map((t, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={t.name || ''} onChange={e => setTestimonials(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} placeholder="Nom" />
                    <Input value={t.company || ''} onChange={e => setTestimonials(prev => prev.map((x, xi) => xi === i ? { ...x, company: e.target.value } : x))} placeholder="Entreprise" />
                    <Button variant="ghost" size="icon" onClick={() => setTestimonials(prev => prev.filter((_, xi) => xi !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Textarea value={t.text || ''} onChange={e => setTestimonials(prev => prev.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x))} placeholder="Témoignage" />
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Note</Label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} type="button" onClick={() => setTestimonials(prev => prev.map((x, xi) => xi === i ? { ...x, rating: n } : x))}>
                          <Star className={`h-4 w-4 ${n <= (t.rating || 5) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTestimonials(prev => [...prev, { name: '', text: '', company: '', rating: 5 }])}>
                <Plus className="h-4 w-4 mr-1" />Ajouter un témoignage
              </Button>
              <div className="pt-2">
                <Button onClick={handleSavePage} disabled={updatePage.isPending}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads tab */}
        <TabsContent value="leads">
          <Card>
            <CardContent className="pt-6">
              {offerLeads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun lead pour cette offre</p>
              ) : (
                <div className="space-y-2">
                  {offerLeads.map(lead => (
                    <Link key={lead.id} to={`/leads/${lead.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.email}</p>
                      </div>
                      <Badge variant="outline">{lead.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bookings tab */}
        <TabsContent value="bookings">
          <Card>
            <CardContent className="pt-6">
              {offerBookings.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun rendez-vous pour cette offre</p>
              ) : (
                <div className="space-y-2">
                  {offerBookings.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium text-sm">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.booking_date} à {b.time_slot}</p>
                      </div>
                      <Badge variant={b.status === 'confirmed' ? 'default' : 'outline'}>{b.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
