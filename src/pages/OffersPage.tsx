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
import OfferAIWizard from '@/components/offers/OfferAIWizard';
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
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '', niche: '' });

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await createOffer.mutateAsync(form);
    setForm({ name: '', description: '', price: '', niche: '' });
    setOpen(false);
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
          onClick={() => setAiOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Créer avec l'IA
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
                        onClick={() => deleteOffer.mutate(offer.id)}
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
                    <Link to={`/offers/${offer.id}/studio`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Studio
                      </Button>
                    </Link>
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

      <OfferAIWizard
        open={aiOpen}
        onOpenChange={setAiOpen}
        onCreated={(offerId) => navigate(`/offers/${offerId}/studio`)}
      />
    </div>
  );
}
