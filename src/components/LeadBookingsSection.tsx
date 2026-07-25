import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

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

export function LeadBookingsSection({ leadId }: { leadId: string }) {
  const navigate = useNavigate();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['lead-bookings', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_date, time_slot, status, notes, offers(name)')
        .eq('lead_id', leadId)
        .order('booking_date', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bookings.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-3">
      <h3 className="font-heading text-base flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-primary" />
        Rendez-vous ({bookings.length})
      </h3>

      <div className="space-y-2">
        {bookings.map((b) => (
          <button
            key={b.id}
            onClick={() => navigate(`/bookings?booking=${b.id}`)}
            className="w-full text-left rounded-lg border border-white/5 bg-background/40 p-3 flex items-center justify-between gap-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {format(parseISO(b.booking_date), 'EEEE dd MMM yyyy', { locale: fr })}
                </span>
                <Badge className={`${statusColors[b.status] || ''} text-[10px]`}>
                  {statusLabels[b.status] || b.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{b.time_slot}</span>
                </span>
                {b.offers?.name && <span className="truncate">· {b.offers.name}</span>}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
