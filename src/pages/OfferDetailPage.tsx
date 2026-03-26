import { useParams, Link } from 'react-router-dom';
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
import { ArrowLeft, ExternalLink, Users, CalendarCheck, Loader2, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (offer) setForm({ name: offer.name, description: offer.description || '', price: offer.price || '', niche: offer.niche || '', is_active: offer.is_active });
  }, [offer]);

  useEffect(() => {
    if (offerPage) setPageForm({ headline: offerPage.headline, subheadline: offerPage.subheadline, cta_text: offerPage.cta_text });
  }, [offerPage]);

  const handleSaveOffer = async () => {
    if (!id) return;
    await updateOffer.mutateAsync({ id, ...form });
    toast.success('Offre mise à jour');
  };

  const handleSavePage = async () => {
    if (!offerPage) return;
    await updatePage.mutateAsync({ id: offerPage.id, ...pageForm });
    toast.success('Page mise à jour');
  };

  const offerLeads = leads?.filter(l => (l as any).offer_id === id) || [];
  const offerBookings = bookings?.filter(b => b.offer_id === id) || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!offer) return <div className="text-center py-16 text-muted-foreground">Offre introuvable</div>;

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
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="page">Landing Page</TabsTrigger>
          <TabsTrigger value="leads">Leads ({offerLeads.length})</TabsTrigger>
          <TabsTrigger value="bookings">RDV ({offerBookings.length})</TabsTrigger>
        </TabsList>

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

        <TabsContent value="page">
          <Card>
            <CardHeader><CardTitle>Landing Page</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titre principal</Label><Input value={pageForm.headline} onChange={e => setPageForm(f => ({ ...f, headline: e.target.value }))} /></div>
              <div><Label>Sous-titre</Label><Textarea value={pageForm.subheadline} onChange={e => setPageForm(f => ({ ...f, subheadline: e.target.value }))} /></div>
              <div><Label>Texte du bouton CTA</Label><Input value={pageForm.cta_text} onChange={e => setPageForm(f => ({ ...f, cta_text: e.target.value }))} /></div>
              <Button onClick={handleSavePage} disabled={updatePage.isPending}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
            </CardContent>
          </Card>
        </TabsContent>

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
