import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from './useWorkspaces';

const LS_KEY = 'wa-inbox-lastSeen';

function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function writeSeen(map: Record<string, number>) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export type ConversationChannel = 'whatsapp' | 'messenger' | 'instagram';

export type InboxItem = {
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  last_message: string;
  last_at: string;
  last_direction: 'inbound' | 'outbound';
  unread: boolean;
  channel: ConversationChannel;
};

export function useWhatsAppInbox() {
  const qc = useQueryClient();
  const [seenVersion, setSeenVersion] = useState(0);
  const wsId = useCurrentWorkspaceId();

  // Realtime: refetch only on inserts for the current workspace
  useEffect(() => {
    if (!wsId) return;
    const channelName = `wa-inbox-${wsId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `workspace_id=eq.${wsId}` },
        () => { qc.invalidateQueries({ queryKey: ['wa-inbox', wsId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, wsId]);

  const query = useQuery({
    queryKey: ['wa-inbox', wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<InboxItem[]> => {
      let q: any = supabase
        .from('whatsapp_messages')
        .select('id, lead_id, content, sent_at, direction, workspace_id, channel');
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data: msgs, error } = await q.order('sent_at', { ascending: false }).limit(500);
      if (error) throw error;

      const byLead = new Map<string, any>();
      for (const m of msgs ?? []) {
        if (!byLead.has(m.lead_id)) byLead.set(m.lead_id, m);
      }
      const leadIds = Array.from(byLead.keys());
      if (leadIds.length === 0) return [];

      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, phone')
        .in('id', leadIds)
        .is('deleted_at', null);
      const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
      const visibleLeadIds = leadIds.filter((id) => leadMap.has(id));

      const seen = readSeen();
      const items: InboxItem[] = visibleLeadIds.map((id) => {
        const m = byLead.get(id);
        const l: any = leadMap.get(id) ?? { name: 'Lead inconnu', phone: null };
        const lastTs = new Date(m.sent_at).getTime();
        const seenTs = seen[id] || 0;
        return {
          lead_id: id,
          lead_name: l.name,
          lead_phone: l.phone,
          last_message: m.content,
          last_at: m.sent_at,
          last_direction: m.direction,
          unread: m.direction === 'inbound' && lastTs > seenTs,
          channel: (m.channel ?? 'whatsapp') as ConversationChannel,
        };
      });
      items.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
      return items;
    },
    refetchOnWindowFocus: true,
  });

  const items = useMemo(() => {
    if (!query.data) return [];
    const seen = readSeen();
    return query.data.map((it) => ({
      ...it,
      unread: it.last_direction === 'inbound' && new Date(it.last_at).getTime() > (seen[it.lead_id] || 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, seenVersion]);

  const markSeen = useCallback((leadId: string) => {
    const seen = readSeen();
    seen[leadId] = Date.now();
    writeSeen(seen);
    setSeenVersion((v) => v + 1);
  }, []);

  const unreadCount = items.filter((i) => i.unread).length;

  return { items, isLoading: query.isLoading, markSeen, unreadCount };
}
