import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Mail, Bell, Building2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { toast } from 'sonner';

type Pref = { workspace_id: string; email_enabled: boolean; push_enabled: boolean; whatsapp_enabled: boolean };

export function WorkspaceNotificationPrefs() {
  const { user } = useAuth();
  const { workspaces } = useWorkspaces();
  const qc = useQueryClient();

  const { data: prefs = [] } = useQuery({
    queryKey: ['user-ws-notif-prefs', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Pref[]> => {
      const { data, error } = await supabase
        .from('user_workspace_notification_prefs' as any)
        .select('workspace_id, email_enabled, push_enabled, whatsapp_enabled')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const prefByWs = new Map(prefs.map((p) => [p.workspace_id, p]));

  const update = useMutation({
    mutationFn: async (payload: { workspace_id: string; email_enabled: boolean; push_enabled: boolean; whatsapp_enabled: boolean }) => {
      const { error } = await supabase
        .from('user_workspace_notification_prefs' as any)
        .upsert(
          { user_id: user!.id, ...payload },
          { onConflict: 'user_id,workspace_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-ws-notif-prefs', user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (workspaceId: string, channel: 'email' | 'push' | 'whatsapp', value: boolean) => {
    const current = prefByWs.get(workspaceId) || {
      workspace_id: workspaceId,
      email_enabled: true,
      push_enabled: true,
      whatsapp_enabled: true,
    };
    update.mutate({
      workspace_id: workspaceId,
      email_enabled: channel === 'email' ? value : current.email_enabled,
      push_enabled: channel === 'push' ? value : current.push_enabled,
      whatsapp_enabled: channel === 'whatsapp' ? value : current.whatsapp_enabled,
    });
  };

  if (!workspaces || workspaces.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Notifications par workspace
        </CardTitle>
        <CardDescription>
          Choisis pour quels workspaces tu veux recevoir des emails ou notifications push.
          Les autres membres de chaque workspace continuent de recevoir les leurs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {workspaces.map((ws) => {
          const p = prefByWs.get(ws.id);
          const email = p ? p.email_enabled : true;
          const push = p ? p.push_enabled : true;
          const wa = p ? p.whatsapp_enabled : true;
          return (
            <div
              key={ws.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{ws.company_name || 'Workspace'}</div>
                <div className="text-xs text-muted-foreground">
                  {ws.role === 'owner' ? 'Propriétaire' : 'Membre'}
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Email</span>
                  <Switch checked={email} onCheckedChange={(v) => toggle(ws.id, 'email', v)} />
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Push</span>
                  <Switch checked={push} onCheckedChange={(v) => toggle(ws.id, 'push', v)} />
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">WhatsApp</span>
                  <Switch checked={wa} onCheckedChange={(v) => toggle(ws.id, 'whatsapp', v)} />
                </label>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
