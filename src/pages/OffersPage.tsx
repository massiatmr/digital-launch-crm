import { toast } from 'sonner';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOffers, useCreateOffer, useDeleteOffer, useUpdateOffer } from '@/hooks/useOfferData';
import { useLeads } from '@/hooks/useLeadData';
import { useBookings } from '@/hooks/useOfferData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus, ExternalLink, Trash2, Eye, EyeOff, Users, CalendarCheck, Loader2, Sparkles, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { DialogFooter } from '@/components/ui/dialog';

export default function OffersPage() {
  const navigate = useNavigate();
  const { data: offers, isLoading } = useOffers();
  const { data: leads } = useLeads();
  const { data: bookings } = useBookings();
  const createOffer = useCreateOffer();
  const deleteOffer = useDeleteOffer();
  const updateOffer = useUpdateOffer();
  const [open, setOpen] = useState(false);
  const empty = { name: '', description: '', price: '', niche: '', vsl_link: '' };
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const busy = createOffer.isPending || updateOffer.isPending;

  const openCreate = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (o: any) => {
    setEditId(o.id);
    setForm({ name: o.name || '', description: o.description || '', price: o.price || '', niche: o.niche || '', vsl_link: o.vsl_link || '' });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await updateOffer.mutateAsync({ id: editId, ...form, name: form.name.trim(), vsl_link: form.vsl_link.trim() || null });
      } else {
        const { vsl_link, ...rest } = form;
        const created: any = await createOffer.mutateAsync({ ...rest, name: form.name.trim() });
        if (vsl_link.trim() && created?.id) await updateOffer.mutateAsync({ id: created.id, vsl_link: vsl_link.trim() });
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erreur');
    }
  };

  const getOfferStats = (offerId: string) => {
    const offerLeads = leads?.filter(l => (l as any).offer_id === offerId) || [];
    const offerBookings = bookings?.filter(b => b.offer_id === offerId) || [];
    return { leads: offerLeads.length, bookings: offerBookings.length };
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offres</h1>
          <p className="text-muted-foreground text-sm mt-1">{offers?.length || 0} offre(s)</p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle offre
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offers?.map((offer, i) => {
          const stats = getOfferStats(offer.id);
          return (
            <motion.div key={offer.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="group hover:border-primary/30 transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <Link to={`/offers/${offer.id}`}>
                        <CardTitle className="text-base truncate hover:text-primary transition-colors">{offer.name}</CardTitle>
                      </Link>
                      {offer.niche && <Badge variant="secondary" className="mt-1 text-xs">{offer.niche}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateOffer.mutate({ id: offer.id, is_active: !offer.is_active })}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title={offer.is_active ? 'Désactiver' : 'Activer'}
                      >
                        {offer.is_active ? <Eye className="h-4 w-4 text-green-400" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <button
                        onClick={() => openEdit(offer)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Supprimer l'offre « ${offer.name} » ?`)) deleteOffer.mutate(offer.id); }}
                        title="Supprimer"
                        className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {offer.description && <p className="text-sm text-muted-foreground line-clamp-2">{offer.description}</p>}
                  {offer.price && <p className="text-lg font-bold text-primary">{offer.price}</p>}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{stats.leads} leads</span>
                    <span className="flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />{stats.bookings} RDV</span>
                  </div>
                    <div className="flex gap-2 pt-2">
                    {offer.is_active && (
                      <Link to={`/offers/${offer.slug}/page`} target="_blank">
                        <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}

        {(!offers || offers.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-foreground">Aucune offre</h3>
            <p className="text-sm text-muted-foreground mt-1">Crée ta première offre pour commencer</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Modifier l'offre" : 'Nouvelle offre'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            <div><Label>Niche</Label><Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></div>
            <div><Label>Prix</Label><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Lien vidéo VSL</Label><Input value={form.vsl_link} onChange={(e) => setForm({ ...form, vsl_link: e.target.value })} placeholder="https://…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
