import { useParams, Link } from 'react-router-dom';
import { useSmartBack } from '@/hooks/useSmartBack';
import { useOffer, useUpdateOffer, useBookings } from '@/hooks/useOfferData';
import { useLeads } from '@/hooks/useLeadData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Users, CalendarCheck, Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const goBack = useSmartBack('/offers');
  const { data: offer, isLoading } = useOffer(id);
  const { data: leads } = useLeads();
  const { data: bookings } = useBookings();
  const updateOffer = useUpdateOffer();

  const offerLeads = leads?.filter((l) => (l as any).offer_id === id) || [];
  const offerBookings = bookings?.filter((b) => b.offer_id === id) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!offer) return <div className="text-center py-16 text-muted-foreground">Offre introuvable</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{offer.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {offer.niche && <Badge variant="secondary">{offer.niche}</Badge>}
            <Badge variant={offer.is_active ? 'default' : 'outline'}>
              {offer.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/offers/${id}/studio`}>
            <Button>
              <Sparkles className="h-4 w-4 mr-2" />
              Éditer avec l'IA
            </Button>
          </Link>
          {offer.is_active && (
            <Link to={`/offers/${offer.slug}/page`} target="_blank">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Voir la page
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{offerLeads.length}</p>
              <p className="text-xs text-muted-foreground">Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-accent" />
            <div>
              <p className="text-2xl font-bold">{offerBookings.length}</p>
              <p className="text-xs text-muted-foreground">RDV</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aperçu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {offer.description && <p className="text-sm text-muted-foreground">{offer.description}</p>}
          {offer.price && <p className="text-lg font-bold text-primary">{offer.price}</p>}
          <div className="flex items-center gap-2 pt-2">
            <Switch
              checked={offer.is_active}
              onCheckedChange={(v) => updateOffer.mutate({ id: offer.id, is_active: v })}
            />
            <Label className="flex items-center gap-1.5">
              {offer.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Page publique {offer.is_active ? 'activée' : 'désactivée'}
            </Label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads ({offerLeads.length})</TabsTrigger>
          <TabsTrigger value="bookings">RDV ({offerBookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <Card>
            <CardContent className="pt-6">
              {offerLeads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun lead pour cette offre</p>
              ) : (
                <div className="space-y-2">
                  {offerLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
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
                  {offerBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium text-sm">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.booking_date} à {b.time_slot}
                        </p>
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
