import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { useFollowupSettings } from '@/hooks/useFollowupTasks';
import { WhatsAppChat } from '@/components/WhatsAppChat';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle, Search, ExternalLink, FlaskConical, Loader2, PenSquare } from 'lucide-react';
import { NewConversationSheet } from '@/components/conversations/NewConversationSheet';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function ConversationsPage() {
  const [params, setParams] = useSearchParams();
  const { items, isLoading, markSeen } = useWhatsAppInbox();
  const { data: settings } = useFollowupSettings();
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState(false);
  const selectedId = params.get('lead');
  const highlight = params.get('highlight') === '1';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.lead_name.toLowerCase().includes(q) || (i.lead_phone || '').includes(q));
  }, [items, search]);

  const selected = items.find((i) => i.lead_id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && items.length && window.innerWidth >= 768) {
      setParams({ lead: items[0].lead_id }, { replace: true });
    }
  }, [items, selectedId, setParams]);

  useEffect(() => {
    if (selectedId) markSeen(selectedId);
  }, [selectedId, markSeen]);

  useEffect(() => {
    if (!highlight || !selected) return;
    setFlash(true);
    const t = setTimeout(() => {
      setFlash(false);
      const next = new URLSearchParams(params);
      next.delete('highlight');
      setParams(next, { replace: true });
    }, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, selected?.lead_id]);

  const selectLead = (id: string) => setParams({ lead: id });
  const back = () => setParams({});

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] md:h-[calc(100dvh-2rem)] -mx-4 md:mx-0 -mb-20 md:mb-0">
      {settings?.dry_run && (
        <div className="mx-2 md:mx-4 mt-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-yellow-300">
            <FlaskConical className="h-3.5 w-3.5" /> Mode test — aucun message WhatsApp réel n'est envoyé.
          </span>
          <Link to="/settings/automation" className="underline text-yellow-200 shrink-0">Passer en LIVE</Link>
        </div>
      )}

      <div className="flex-1 grid md:grid-cols-[320px_1fr] min-h-0 gap-0 md:gap-2 p-2 md:p-4">
        {/* LEFT: list */}
        <aside className={cn(
          'flex flex-col rounded-xl border border-border bg-card min-h-0',
          selected ? 'hidden md:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-sm">Conversations</h2>
              <Badge variant="outline" className="ml-auto text-xs">{items.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-7 h-8 text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center p-6">Aucune conversation.</p>
            ) : filtered.map((it) => (
              <button
                key={it.lead_id}
                onClick={() => selectLead(it.lead_id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors flex gap-2',
                  selectedId === it.lead_id && 'bg-primary/10'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{it.lead_name}</span>
                    {it.unread && <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className={cn('text-xs truncate mt-0.5', it.unread ? 'text-foreground' : 'text-muted-foreground')}>
                    {it.last_direction === 'outbound' && '↗ '}{it.last_message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(it.last_at), { addSuffix: true, locale: fr })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT: chat */}
        <section className={cn('flex flex-col min-h-0', !selected && 'hidden md:flex')}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Sélectionne une conversation
            </div>
          ) : (
            <div className={cn('flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden', flash && 'highlight-flash')}>
              <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={back}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{selected.lead_name}</p>
                  {selected.lead_phone && <p className="text-xs text-muted-foreground truncate">{selected.lead_phone}</p>}
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1">
                  <Link to={`/leads/${selected.lead_id}`}>Fiche <ExternalLink className="h-3 w-3" /></Link>
                </Button>
              </header>
              <div className="flex-1 min-h-0 p-2">
                <WhatsAppChat leadId={selected.lead_id} leadName={selected.lead_name} className="h-full" />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
