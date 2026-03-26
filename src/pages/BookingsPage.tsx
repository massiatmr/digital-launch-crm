import { useState } from 'react';
import { useBookings, useUpdateBooking, useOffers } from '@/hooks/useOfferData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, Clock, Mail, Phone, User, Loader2, Filter } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion } from 'framer-motion';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  confirmed: 'bg-green-500/10 text-green-400 border-green-500/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  completed: 'Terminé',
};

export default function BookingsPage() {
  const { data: bookings, isLoading } = useBookings();
  const { data: offers } = useOffers();
  const updateBooking = useUpdateBooking();
  const [offerFilter, setOfferFilter] = useState<string>('all');

  const filtered = bookings?.filter(b => offerFilter === 'all' || b.offer_id === offerFilter) || [];
  const upcoming = filtered.filter(b => b.status !== 'cancelled' && b.status !== 'completed' && isAfter(parseISO(b.booking_date), new Date()) || isToday(parseISO(b.booking_date)));
  const past = filtered.filter(b => b.status === 'completed' || (!isToday(parseISO(b.booking_date)) && isBefore(parseISO(b.booking_date), new Date())));

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rendez-vous</h1>
          <p className="text-muted-foreground text-sm mt-1">{upcoming.length} à venir</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={offerFilter} onValueChange={setOfferFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Toutes les offres" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les offres</SelectItem>
              {offers?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">À venir</h2>
          <div className="grid gap-3">
            {upcoming.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="hover:border-primary/20 transition-all">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{b.name}</span>
                          <Badge className={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />{format(parseISO(b.booking_date), 'dd MMM yyyy', { locale: fr })}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{b.time_slot}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{b.email}</span>
                          {b.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</span>}
                        </div>
                        {b.offers?.name && <Badge variant="outline" className="text-xs">{b.offers.name}</Badge>}
                      </div>
                      <div className="flex gap-1">
                        {b.status === 'pending' && (
                          <Button size="sm" onClick={() => updateBooking.mutate({ id: b.id, status: 'confirmed' })}>Confirmer</Button>
                        )}
                        {(b.status === 'pending' || b.status === 'confirmed') && (
                          <Button size="sm" variant="outline" onClick={() => updateBooking.mutate({ id: b.id, status: 'cancelled' })}>Annuler</Button>
                        )}
                        {b.status === 'confirmed' && (
                          <Button size="sm" variant="secondary" onClick={() => updateBooking.mutate({ id: b.id, status: 'completed' })}>Terminé</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Passés</h2>
          <div className="grid gap-3">
            {past.map(b => (
              <Card key={b.id} className="opacity-60">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{b.name}</span>
                      <span className="text-xs text-muted-foreground">{format(parseISO(b.booking_date), 'dd MMM yyyy', { locale: fr })} à {b.time_slot}</span>
                      {b.offers?.name && <Badge variant="outline" className="text-xs">{b.offers.name}</Badge>}
                    </div>
                    <Badge className={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-foreground">Aucun rendez-vous</h3>
          <p className="text-sm text-muted-foreground mt-1">Les réservations via tes landing pages apparaîtront ici</p>
        </div>
      )}
    </div>
  );
}
