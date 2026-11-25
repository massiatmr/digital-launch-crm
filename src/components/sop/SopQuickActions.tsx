import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Phone, PhoneOff, MessageCircle, Check, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces, useDefaultCountryCode } from '@/hooks/useWorkspaces';
import { useSopConfig } from '@/hooks/useSopConfig';
import { renderSop, type SopMessage } from '@/lib/sop';
import { resolveGreetingName } from '@/lib/whatsappPersonalization';
import { toWhatsAppUrl } from '@/lib/phone';
import { cn } from '@/lib/utils';

/** Manual SOP actions: the assistant sends from her own WhatsApp (wa.me) and each click is logged. */
export function SopQuickActions({ lead }: { lead: any }) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspaces();
  const cc = useDefaultCountryCode();
  const qc = useQueryClient();
  const { data: cfg } = useSopConfig(lead.workspace_id);
  const [open, setOpen] = useState<SopMessage | null>(null);
  const [text, setText] = useState('');

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

  const openMsg = (m: SopMessage) => { setText(renderSop(m.body, vars)); setOpen(m); };
  const send = async () => {
    if (!open) return;
    if (/\{[^{}]+\}/.test(text) && !confirm('Il reste des champs entre {accolades} à remplir. Envoyer quand même ?')) return;
    if (lead.phone) window.open(`${toWhatsAppUrl(lead.phone, cc)}?text=${encodeURIComponent(text)}`, '_blank');
    await log('whatsapp', `Message ${open.label} envoyé (WhatsApp perso)`);
    toast.success(`Message ${open.key} noté`);
    setOpen(null);
  };
  const copy = async () => { await navigator.clipboard.writeText(text); toast.success('Message copié'); };

  const messages = cfg.messages.filter((m) => m.enabled);
  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" /> Process</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="h-10" onClick={async () => { await log('call', 'Appel passé — a décroché'); toast.success('Appel noté'); }}>
          <Phone className="mr-1 h-4 w-4" /> A décroché
        </Button>
        <Button size="sm" variant="outline" className="h-10" onClick={async () => { await log('call', 'Appel passé — pas de réponse'); toast.success('Appel sans réponse noté'); }}>
          <PhoneOff className="mr-1 h-4 w-4" /> Pas répondu
        </Button>
        {messages.map((m) => (
          <Button key={m.key} size="sm" variant="outline" className="h-10" onClick={() => openMsg(m)} title={m.when}>
            <MessageCircle className="mr-1 h-4 w-4" /> {m.label}
          </Button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Message {open?.label}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{open?.when}. Vérifie le texte, puis envoie-le depuis ton WhatsApp.</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className={cn('text-base sm:text-sm')} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={copy}>Copier</Button>
            <Button onClick={send}><Check className="mr-1 h-4 w-4" />{lead.phone ? 'Ouvrir WhatsApp' : 'Marquer envoyé'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
