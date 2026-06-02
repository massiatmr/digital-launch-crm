import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Phone, Search, User, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId, useDefaultCountryCode } from '@/hooks/useWorkspaces';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Contact = {
  kind: 'lead' | 'client';
  id: string;
  name: string;
  phone: string;
  company_name?: string | null;
};

export function NewConversationSheet({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPicked: (leadId: string) => void;
}) {
  const wsId = useCurrentWorkspaceId();
  const cc = useDefaultCountryCode();
  const { items } = useWhatsAppInbox();
  const existingLeadIds = useMemo(() => new Set(items.map((i) => i.lead_id)), [items]);

  const [tab, setTab] = useState<'contacts' | 'phone'>('contacts');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Phone tab
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
      setPhone('');
      setName('');
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || tab !== 'contacts') return;
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const q = search.trim();
      const list: Contact[] = [];

      const orFilter = q
        ? `name.ilike.%${q}%,phone.ilike.%${q}%`
        : undefined;

      // Leads
      let leadsQ: any = supabase
        .from('leads')
        .select('id, name, phone, company_name')
        .is('deleted_at', null)
        .neq('phone', '');
      if (wsId) leadsQ = leadsQ.eq('workspace_id', wsId);
      if (orFilter) leadsQ = leadsQ.or(orFilter);
      const { data: leads } = await leadsQ.order('updated_at', { ascending: false }).limit(30);
      for (const l of leads || []) {
        if (l.phone) list.push({ kind: 'lead', id: l.id, name: l.name, phone: l.phone, company_name: l.company_name });
      }

      // Clients
      let clientsQ: any = supabase
        .from('clients')
        .select('id, name, phone, company_name')
        .is('deleted_at', null)
        .neq('phone', '');
      if (wsId) clientsQ = clientsQ.eq('workspace_id', wsId);
      if (orFilter) clientsQ = clientsQ.or(orFilter);
      const { data: clients } = await clientsQ.order('updated_at', { ascending: false }).limit(30);
      for (const c of clients || []) {
        if (c.phone) list.push({ kind: 'client', id: c.id, name: c.name, phone: c.phone, company_name: c.company_name });
      }

      // Tri : conversations existantes d'abord, puis alpha
      list.sort((a, b) => {
        const ax = a.kind === 'lead' && existingLeadIds.has(a.id) ? 0 : 1;
        const bx = b.kind === 'lead' && existingLeadIds.has(b.id) ? 0 : 1;
        if (ax !== bx) return ax - bx;
        return a.name.localeCompare(b.name);
      });

      if (!cancel) {
        setResults(list.slice(0, 50));
        setLoading(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [search, tab, open, wsId, existingLeadIds]);

  const pickContact = async (c: Contact) => {
    if (c.kind === 'lead') {
      onPicked(c.id);
      onOpenChange(false);
      return;
    }
    // Client → on cherche un lead existant avec même tél dans le workspace, sinon on en crée un
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      let q: any = supabase.from('leads').select('id').eq('phone', c.phone).is('deleted_at', null).limit(1);
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data: existing } = await q;
      if (existing && existing.length > 0) {
        onPicked((existing[0] as any).id);
        onOpenChange(false);
        return;
      }
      const { data: created, error } = await supabase
        .from('leads')
        .insert({
          name: c.name,
          phone: c.phone,
          company_name: c.company_name || '',
          source: 'manual',
          status: 'new',
          owner_id: user.id,
          workspace_id: wsId ?? null,
          notes: `Conversation initiée depuis le client ${c.id}`,
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      onPicked((created as any).id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  const startFromPhone = async () => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (!/^\+?\d{8,15}$/.test(cleaned)) {
      toast.error('Numéro invalide (8-15 chiffres, format international)');
      return;
    }
    // Normalise via wa.me helper (FR 0 → +33)
    const url = toWhatsAppUrl(cleaned, cc);
    const normalized = '+' + url.replace('https://wa.me/', '');
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      // Cherche un lead existant avec ce tél
      let q: any = supabase.from('leads').select('id').eq('phone', normalized).is('deleted_at', null).limit(1);
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data: existing } = await q;
      if (existing && existing.length > 0) {
        onPicked((existing[0] as any).id);
        onOpenChange(false);
        return;
      }

      const { data: created, error } = await supabase
        .from('leads')
        .insert({
          name: name.trim() || formatPhoneDisplay(normalized, cc),
          phone: normalized,
          source: 'manual',
          status: 'new',
          owner_id: user.id,
          workspace_id: wsId ?? null,
          notes: 'Conversation initiée depuis l\'onglet Conversations',
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      onPicked((created as any).id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Nouvelle conversation
          </SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col mt-4 min-h-0">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="contacts"><Users className="h-3.5 w-3.5 mr-1" /> Contacts</TabsTrigger>
            <TabsTrigger value="phone"><Phone className="h-3.5 w-3.5 mr-1" /> Numéro libre</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="flex-1 flex flex-col min-h-0 mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un lead ou client…"
                className="pl-7 h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto -mx-4 px-2">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {search ? 'Aucun résultat.' : 'Tape pour rechercher.'}
                </p>
              ) : (
                results.map((c) => {
                  const hasConv = c.kind === 'lead' && existingLeadIds.has(c.id);
                  return (
                    <button
                      key={`${c.kind}-${c.id}`}
                      disabled={creating}
                      onClick={() => pickContact(c)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors flex items-center gap-3 disabled:opacity-50'
                      )}
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{c.name}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1">{c.kind === 'lead' ? 'Lead' : 'Client'}</Badge>
                          {hasConv && <span className="text-[10px] text-primary">💬</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{formatPhoneDisplay(c.phone, cc)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="phone" className="mt-3 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Numéro de téléphone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                inputMode="tel"
                maxLength={20}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nom (optionnel)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marie Dupont" maxLength={100} />
            </div>
            <Button onClick={startFromPhone} disabled={creating || !phone.trim()} className="w-full">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Démarrer la conversation'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Un lead minimal sera créé automatiquement pour cette discussion.
            </p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
