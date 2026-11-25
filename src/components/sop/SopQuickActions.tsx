import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Phone, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces, useDefaultCountryCode } from '@/hooks/useWorkspaces';
import { useSopConfig } from '@/hooks/useSopConfig';
import { renderSop, type SopMessage } from '@/lib/sop';
import { resolveGreetingName } from '@/lib/whatsappPersonalization';

/** Shared SOP context (templates with resolved fields + manual contact logger) for a lead. */
export function useSopTemplates(lead: any) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspaces();
  const cc = useDefaultCountryCode();
  const qc = useQueryClient();
  const { data: cfg } = useSopConfig(lead.workspace_id);

  const { data: booking } = useQuery({
    queryKey: ['sop-next-booking', lead.id],
    queryFn: async () => {
      const { data } = await supabase.from('bookings').select('booking_date,time_slot,meet_link,offer_id,offers(name,vsl_link)')
        .eq('lead_id', lead.id).is('deleted_at', null).neq('status', 'cancelled')
        .order('booking_date', { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
  });

  const leadOfferId = (lead as any).offer_id as string | null;
  const { data: leadOffer } = useQuery({
    queryKey: ['sop-lead-offer', leadOfferId],
    enabled: !!leadOfferId,
    queryFn: async () => {
      const { data } = await supabase.from('offers').select('name,vsl_link').eq('id', leadOfferId!).maybeSingle();
      return data as any;
    },
  });

  if (!cfg) return null;
  const meta = (user?.user_metadata || {}) as any;
  const bDate = booking?.booking_date ? new Date(`${booking.booking_date}T12:00:00`) : null;
  const vars = {
    'Prénom': resolveGreetingName(lead.name, lead.company_name) || '',
    Assistante: meta.sop_name || cfg.assistant_label || meta.full_name || '',
    'Numéro': meta.sop_phone || '',
    Entreprise: cfg.company_label || currentWorkspace?.company_name || '',
    Consultant: cfg.consultant_name,
    Jour: bDate ? format(bDate, 'EEEE', { locale: fr }) : '',
    Date: bDate ? format(bDate, 'd MMMM', { locale: fr }) : '',
    Heure: booking?.time_slot?.slice(0, 5)?.replace(':', 'h') || '',
    'Lien visio': booking?.meet_link || cfg.visio_link,
    'Lien VSL': booking?.offers?.vsl_link || leadOffer?.vsl_link || cfg.vsl_link,
    Offre: booking?.offers?.name || leadOffer?.name || '',
  };

  const log = async (type: 'call' | 'whatsapp', description: string) => {
    const now = new Date().toISOString();
    await supabase.from('lead_activities').insert({ lead_id: lead.id, activity_type: type, description, workspace_id: lead.workspace_id } as any);
    const patch: any = { last_contacted_at: now };
    if (!lead.first_contacted_at) patch.first_contacted_at = now;
    if (lead.status === 'new') patch.status = 'contacted';
    await supabase.from('leads').update(patch as any).eq('id', lead.id);
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
  };

  const messages = cfg.messages.filter((m) => m.enabled);
  const render = (m: SopMessage) => renderSop(m.body, vars);
  return { messages, render, log, cc };
}

/** Compact manual call logging; WhatsApp templates live in the interaction form. */
export function SopQuickActions({ lead }: { lead: any }) {
  const sop = useSopTemplates(lead);
  if (!sop) return null;
  const { log } = sop;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Appel :</span>
      <Button size="sm" variant="secondary" className="h-9" onClick={async () => { await log('call', 'Appel passé — a décroché'); toast.success('Appel noté'); }}>
        <Phone className="mr-1 h-4 w-4" /> A décroché
      </Button>
      <Button size="sm" variant="outline" className="h-9" onClick={async () => { await log('call', 'Appel passé — pas de réponse'); toast.success('Appel sans réponse noté'); }}>
        <PhoneOff className="mr-1 h-4 w-4" /> Pas répondu
      </Button>
    </div>
  );
}
