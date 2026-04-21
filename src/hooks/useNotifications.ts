import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const LS_KEY = 'notif-lastSeenAt';

function readSeen(userId: string): number {
  try { return Number(localStorage.getItem(`${LS_KEY}:${userId}`) || 0); } catch { return 0; }
}
function writeSeen(userId: string, ts: number) {
  localStorage.setItem(`${LS_KEY}:${userId}`, String(ts));
}

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  status: string;
  source: string;
  unread: boolean;
};

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [seenVersion, setSeenVersion] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'push_delivery_logs', filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ['notifications', user.id] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, user?.id]);

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Omit<NotificationItem, 'unread'>[]> => {
      const { data, error } = await supabase
        .from('push_delivery_logs')
        .select('id, title, body_preview, created_at, status, source')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []).map((d: any) => ({
        id: d.id,
        title: d.title || 'Notification',
        body: d.body_preview,
        created_at: d.created_at,
        status: d.status,
        source: d.source,
      }));
    },
    refetchOnWindowFocus: true,
  });

  const items: NotificationItem[] = useMemo(() => {
    if (!query.data || !user?.id) return [];
    const seenTs = readSeen(user.id);
    return query.data.map((n) => ({
      ...n,
      unread: new Date(n.created_at).getTime() > seenTs,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, seenVersion, user?.id]);

  const unreadCount = items.filter((i) => i.unread).length;

  const markAllSeen = useCallback(() => {
    if (!user?.id) return;
    writeSeen(user.id, Date.now());
    setSeenVersion((v) => v + 1);
  }, [user?.id]);

  return { items, isLoading: query.isLoading, unreadCount, markAllSeen };
}
