import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { useFollowupSettings } from '@/hooks/useFollowupTasks';
import { WhatsAppChat } from '@/components/WhatsAppChat';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle, Search, ExternalLink, FlaskConical, Loader2, PenSquare, CalendarClock, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NewConversationSheet } from '@/components/conversations/NewConversationSheet';
import { ConversationActions } from '@/components/conversations/ConversationActions';
import { CreateTaskForLeadDialog } from '@/components/CreateTaskForLeadDialog';
import { InboxTabs, type InboxTab } from '@/components/conversations/InboxTabs';
import { ChannelBadge, channelLabel } from '@/components/conversations/ChannelBadge';
import type { ConversationChannel } from '@/hooks/useWhatsAppInbox';
import { useAllConvControls } from '@/hooks/useConversationControls';
import { useAllLabelAssignments, useConvLabels } from '@/hooks/useConversationLabels';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function ConversationsPage() {
  const [params, setParams] = useSearchParams();
  const { items, isLoading, markSeen } = useWhatsAppInbox();
  const { data: settings } = useFollowupSettings();
  const { data: ctlAll = [] } = useAllConvControls();
  const { data: labels = [] } = useConvLabels();
  const { data: assignments = [] } = useAllLabelAssignments();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<InboxTab>('all');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ConversationChannel | 'all'>('all');
  const [flash, setFlash] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const selectedId = params.get('lead');
  const highlight = params.get('highlight') === '1';

  const ctlMap = useMemo(() => new Map(ctlAll.map((c) => [c.lead_id, c])), [ctlAll]);
  const labelsByLead = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignments) {
      const arr = m.get(a.lead_id) ?? [];
      arr.push(a.label_id);
      m.set(a.lead_id, arr);
    }
    return m;
  }, [assignments]);

  const counts = useMemo(() => {
    const c: Record<InboxTab, number> = { all: 0, unread: 0, to_reply: 0, waiting: 0, snoozed: 0, resolved: 0 };
    const now = Date.now();
    for (const it of items) {
      const ctl = ctlMap.get(it.lead_id);
      const isResolved = !!ctl?.resolved_at;
      const isSnoozed = ctl?.snoozed_until ? new Date(ctl.snoozed_until).getTime() > now : false;
      c.all++;
      if (isResolved) { c.resolved++; continue; }
      if (isSnoozed) { c.snoozed++; continue; }
      if (it.unread) c.unread++;
      if (it.last_direction === 'inbound') c.to_reply++;
      else c.waiting++;
    }
    return c;
  }, [items, ctlMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return items.filter((it) => {
      if (q) {
        const hit = it.lead_name.toLowerCase().includes(q) || (it.lead_phone || '').includes(q);
        if (!hit) return false;
      }
      if (labelFilter) {
        const ls = labelsByLead.get(it.lead_id) ?? [];
        if (!ls.includes(labelFilter)) return false;
      }
      if (channelFilter !== 'all' && it.channel !== channelFilter) return false;
      const ctl = ctlMap.get(it.lead_id);
      const isResolved = !!ctl?.resolved_at;
      const isSnoozed = ctl?.snoozed_until ? new Date(ctl.snoozed_until).getTime() > now : false;
      switch (tab) {
        case 'all': return !isResolved && !isSnoozed;
        case 'unread': return !isResolved && !isSnoozed && it.unread;
        case 'to_reply': return !isResolved && !isSnoozed && it.last_direction === 'inbound';
        case 'waiting': return !isResolved && !isSnoozed && it.last_direction === 'outbound';
        case 'snoozed': return isSnoozed && !isResolved;
        case 'resolved': return isResolved;
      }
    });
  }, [items, search, tab, labelFilter, channelFilter, ctlMap, labelsByLead]);

  const selected = items.find((i) => i.lead_id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && filtered.length && window.innerWidth >= 768) {
      setParams({ lead: filtered[0].lead_id }, { replace: true });
    }
  }, [filtered, selectedId, setParams]);

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

      <div className="flex-1 grid md:grid-cols-[340px_1fr] min-h-0 gap-0 md:gap-2 p-2 md:p-4">
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
              <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Relances programmées">
                <Link to="/conversations/scheduled"><CalendarClock className="h-3.5 w-3.5" /></Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setComposeOpen(true)}
                title="Nouvelle conversation"
              >
                <PenSquare className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-7 h-8 text-sm" />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'h-8 w-8 shrink-0 relative',
                      (channelFilter !== 'all' || labelFilter) && 'border-primary/60 text-primary'
                    )}
                    title="Filtres"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {(channelFilter !== 'all' || labelFilter) && (
                      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Canal</p>
                      {channelFilter !== 'all' && (
                        <button onClick={() => setChannelFilter('all')} className="text-[10px] text-muted-foreground hover:text-foreground">Réinit.</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(['all', 'whatsapp', 'messenger', 'instagram'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setChannelFilter(c)}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded-md border transition-colors',
                            channelFilter === c
                              ? 'bg-primary/20 border-primary/60 text-primary'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {c === 'all' ? 'Tous' : channelLabel(c)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {labels.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Labels</p>
                        {labelFilter && (
                          <button onClick={() => setLabelFilter(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Réinit.</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {labels.map((l) => (
                          <button
                            key={l.id}
                            onClick={() => setLabelFilter(labelFilter === l.id ? null : l.id)}
                            className={cn(
                              'text-[11px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors',
                              labelFilter === l.id ? 'border-primary/60 bg-primary/10 text-foreground' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                            {l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <InboxTabs active={tab} onChange={setTab} counts={counts} />

            {(channelFilter !== 'all' || labelFilter) && (
              <div className="flex flex-wrap gap-1">
                {channelFilter !== 'all' && (
                  <button
                    onClick={() => setChannelFilter('all')}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary flex items-center gap-1"
                  >
                    {channelLabel(channelFilter)} <X className="h-2.5 w-2.5" />
                  </button>
                )}
                {labelFilter && (() => {
                  const l = labels.find((x) => x.id === labelFilter);
                  if (!l) return null;
                  return (
                    <button
                      onClick={() => setLabelFilter(null)}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-foreground flex items-center gap-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                      {l.name} <X className="h-2.5 w-2.5" />
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center p-6">Aucune conversation.</p>
            ) : filtered.map((it) => {
              const ctl = ctlMap.get(it.lead_id);
              const leadLabels = (labelsByLead.get(it.lead_id) ?? [])
                .map((id) => labels.find((l) => l.id === id))
                .filter(Boolean) as typeof labels;
              return (
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
                      <ChannelBadge channel={it.channel} compact />
                      <span className="font-medium text-sm truncate">{it.lead_name}</span>
                      {ctl?.automation_paused_at && <span title="Auto en pause" className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">PAUSE</span>}
                      {it.unread && <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className={cn('text-xs truncate mt-0.5', it.unread ? 'text-foreground' : 'text-muted-foreground')}>
                      {it.last_direction === 'outbound' && '↗ '}{it.last_message}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(it.last_at), { addSuffix: true, locale: fr })}
                      </p>
                      {leadLabels.slice(0, 3).map((l) => (
                        <span key={l.id} className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{selected.lead_name}</p>
                    <ChannelBadge channel={selected.channel} compact />
                  </div>
                  {selected.lead_phone && <p className="text-xs text-muted-foreground truncate">{selected.lead_phone}</p>}
                </div>
                <ConversationActions leadId={selected.lead_id} />
                <CreateTaskForLeadDialog
                  leadId={selected.lead_id}
                  leadName={selected.lead_name}
                  trigger={
                    <Button variant="ghost" size="sm" className="gap-1 h-8 px-2 text-xs">
                      <Plus className="h-3.5 w-3.5" /> Tâche
                    </Button>
                  }
                />
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

      <NewConversationSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onPicked={(leadId) => setParams({ lead: leadId })}
      />
    </div>
  );
}
