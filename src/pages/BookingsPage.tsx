import { useState, useEffect, useMemo } from 'react';
import { useBookings, useUpdateBooking, useOffers } from '@/hooks/useOfferData';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { ShowStatusToggle } from '@/components/ShowStatusToggle';
import { AvailabilityPanel } from '@/components/bookings/AvailabilityPanel';
import { WeekAvailabilityView } from '@/components/bookings/WeekAvailabilityView';
import { NotificationsTab } from '@/components/bookings/NotificationsTab';
import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CalendarCheck, Clock, Mail, Phone, User, Loader2, Filter, Video, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isSameDay, isAfter, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAvailabilitySettings } from '@/hooks/useAvailabilitySettings';
import { CLIENT_DEFAULT_TZ, clientTimeLabel, tzShortLabel, timeLabelInTz, OWNER_DEFAULT_TZ } from '@/lib/bookingTime';

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
  const { data: availability } = useAvailabilitySettings();
  const ownerTz = availability?.timezone || OWNER_DEFAULT_TZ;
  const ownerTzLabel = tzShortLabel(ownerTz);
  const updateBooking = useUpdateBooking();
  const workspaceId = useCurrentWorkspaceId();
  const [offerFilter, setOfferFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchParams] = useSearchParams();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [tab, setTab] = useState('appointments');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('google') === 'connected') toast.success('Google Calendar connecté !');
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      if (!workspaceId) { setGoogleConnected(false); setCheckingGoogle(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCheckingGoogle(false); return; }
      const { data: row } = await supabase
        .from('calendar_accounts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'google')
        .maybeSingle();
      setGoogleConnected(!!row);
      setCheckingGoogle(false);
    })();
  }, [searchParams, workspaceId]);

  const handleConnectGoogle = async () => {
    const { data, error } = await supabase.functions.invoke('google-auth', {
      body: { workspace_id: workspaceId ?? null },
    });
    if (error) { toast.error('Erreur Google'); return; }
    window.location.href = data.url;
  };

  const filtered = bookings?.filter(b => offerFilter === 'all' || b.offer_id === offerFilter) || [];

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(b => {
      const key = b.booking_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });
    return map;
  }, [filtered]);

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const dayBookings = bookingsByDate.get(selectedKey) || [];
  const upcoming = filtered
    .filter(b => b.status !== 'cancelled' && b.status !== 'completed' && (isToday(parseISO(b.booking_date)) || isAfter(parseISO(b.booking_date), new Date())))
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.time_slot.localeCompare(b.time_slot));

  const getBookingTimes = (b: any) => {
    const clientTz = b.client_timezone || CLIENT_DEFAULT_TZ;
    if (b.client_timezone) {
      return {
        clientTime: clientTimeLabel(b.booking_date, b.time_slot, clientTz, ownerTz)?.time || b.time_slot,
        clientLabel: tzShortLabel(clientTz),
        ownerTime: b.time_slot,
      };
    }
    return {
      clientTime: b.time_slot,
      clientLabel: tzShortLabel(clientTz),
      ownerTime: timeLabelInTz(b.booking_date, b.time_slot, clientTz, ownerTz)?.time || b.time_slot,
    };
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rendez-vous</h1>
          <p className="text-muted-foreground text-sm mt-1">{upcoming.length} à venir</p>
        </div>
        {tab === 'appointments' && (
          <div className="flex items-center gap-2 flex-wrap">
            {!checkingGoogle && (
              googleConnected ? (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Google Calendar
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={handleConnectGoogle}>
                  <CalendarCheck className="h-4 w-4 mr-1" /> Connecter Google Calendar
                </Button>
              )
            )}
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={offerFilter} onValueChange={setOfferFilter}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les offres</SelectItem>
                {offers?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="appointments">Rendez-vous</TabsTrigger>
          <TabsTrigger value="availability">Disponibilités</TabsTrigger>
          <TabsTrigger value="notifications">Notifications & Rappels</TabsTrigger>
        </TabsList>

        {/* TAB 1 : RDV */}
        <TabsContent value="appointments" className="space-y-5 mt-0">
          {/* Prochains RDV en haut, pleine largeur */}
          <Card className="border-white/5 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prochains RDV</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun RDV à venir.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {upcoming.slice(0, 9).map(b => {
                    const d = parseISO(b.booking_date);
                    const isSel = isSameDay(d, selectedDate);
                    const times = getBookingTimes(b);
                    return (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedDate(d); setSelectedBookingId(b.id); }}
                        className={`text-left rounded-lg border p-2.5 transition-all ${isSel ? 'border-primary/40 bg-primary/5' : 'border-white/5 bg-background/40 hover:border-white/20'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{b.name}</span>
                          <Badge className={`${statusColors[b.status]} text-[10px]`}>{statusLabels[b.status]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(d, 'dd MMM', { locale: fr })} · <span className="font-mono">{times.clientTime}</span> <span className="opacity-60">{times.clientLabel}</span>
                          {times.ownerTime !== times.clientTime && <span className="opacity-60"> · <span className="font-mono">{times.ownerTime}</span> {ownerTzLabel} (toi)</span>}
                          {b.offers?.name && ` · ${b.offers.name}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calendrier + détail jour */}
          <WeekAvailabilityView selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          <Card className="border-white/5 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {format(selectedDate, 'EEEE dd MMMM yyyy', { locale: fr })}
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({dayBookings.length} RDV)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dayBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun rendez-vous ce jour-là.</p>
              ) : (
                dayBookings.map((b, i) => {
                  const times = getBookingTimes(b);
                  return <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setSelectedBookingId(b.id)}
                    className="rounded-lg border border-white/5 bg-background/40 p-3 flex items-start justify-between gap-3 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{b.name}</span>
                        <Badge className={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="font-mono">{times.clientTime}</span>
                          <span className="text-[10px] opacity-70 uppercase tracking-wide">{times.clientLabel} client</span>
                          {times.ownerTime !== times.clientTime && (
                            <span className="ml-1 opacity-70 flex items-center gap-1">
                              · <span className="font-mono">{times.ownerTime}</span>
                              <span className="text-[10px] opacity-70 normal-case">{ownerTzLabel} (toi)</span>
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{b.email}</span>
                        {b.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {b.offers?.name && <Badge variant="outline" className="text-xs">{b.offers.name}</Badge>}
                        {b.meet_link && (
                          <a href={b.meet_link} target="_blank" rel="noopener noreferrer">
                            <Badge className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 cursor-pointer hover:bg-primary/20">
                              <Video className="h-3 w-3" /> Meet
                            </Badge>
                          </a>
                        )}
                        {b.lead_id && (
                          <ShowStatusToggle leadId={b.lead_id} currentStatus={(b as any).leads?.show_status || 'pending'} size="sm" />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                  </motion.div>;
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2 : Dispos */}
        <TabsContent value="availability" className="mt-0">
          <AvailabilityPanel />
        </TabsContent>

        {/* TAB 3 : Notifications */}
        <TabsContent value="notifications" className="mt-0">
          <NotificationsTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>

      <BookingDetailSheet
        bookingId={selectedBookingId}
        onOpenChange={(open) => { if (!open) setSelectedBookingId(null); }}
      />
    </div>
  );
}
