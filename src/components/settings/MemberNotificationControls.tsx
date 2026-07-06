import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Bell, MessageCircle, CalendarCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Pref = {
  user_id: string;
  workspace_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  email_booking_enabled: boolean;
};

export function MemberNotificationControls({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const qc = useQueryClient();

  const { data: pref } = useQuery({
    queryKey: ['member-ws-notif-prefs', workspaceId, userId],
    queryFn: async (): Promise<Pref | null> => {
      const { data, error } = await supabase
        .from('user_workspace_notification_prefs' as any)
        .select('user_id, workspace_id, email_enabled, push_enabled, whatsapp_enabled')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Pick<Pref, 'email_enabled' | 'push_enabled' | 'whatsapp_enabled'>>) => {
      const base = {
        user_id: userId,
        workspace_id: workspaceId,
        email_enabled: pref?.email_enabled ?? true,
        push_enabled: pref?.push_enabled ?? true,
        whatsapp_enabled: pref?.whatsapp_enabled ?? true,
        ...patch,
      };
      const { error } = await supabase
        .from('user_workspace_notification_prefs' as any)
        .upsert(base, { onConflict: 'user_id,workspace_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-ws-notif-prefs', workspaceId, userId] });
      toast.success('Préférence mise à jour');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const email = pref?.email_enabled ?? true;
  const push = pref?.push_enabled ?? true;
  const wa = pref?.whatsapp_enabled ?? true;

  return (
    <div className="flex items-center gap-3 flex-wrap pl-2">
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <Mail className="h-3 w-3" />
        <Switch
          checked={email}
          onCheckedChange={(v) => update.mutate({ email_enabled: v })}
          className="scale-75"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <Bell className="h-3 w-3" />
        <Switch
          checked={push}
          onCheckedChange={(v) => update.mutate({ push_enabled: v })}
          className="scale-75"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <MessageCircle className="h-3 w-3" />
        <Switch
          checked={wa}
          onCheckedChange={(v) => update.mutate({ whatsapp_enabled: v })}
          className="scale-75"
        />
      </label>
    </div>
  );
}
