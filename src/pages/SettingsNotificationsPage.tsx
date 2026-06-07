import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Smartphone, Mail, Trash2 } from 'lucide-react';
import { EnablePushButton } from '@/components/EnablePushButton';
import { PwaInstallGuide } from '@/components/PwaInstallGuide';
import { WorkspaceNotificationPrefs } from '@/components/settings/WorkspaceNotificationPrefs';
import { useOwnerProfile, useUpdateOwnerProfile } from '@/hooks/useOwnerProfile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Prefs = {
  email_new_lead: boolean;
  email_new_booking: boolean;
  email_signature_received: boolean;
  push_new_lead: boolean;
  push_new_message: boolean;
  push_reminders: boolean;
};

const DEFAULT_PREFS: Prefs = {
  email_new_lead: true,
  email_new_booking: true,
  email_signature_received: true,
  push_new_lead: true,
  push_new_message: true,
  push_reminders: true,
};

export default function SettingsNotificationsPage() {
  const { user } = useAuth();
  const { data: profile } = useOwnerProfile();
  const update = useUpdateOwnerProfile();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (profile) {
      const p = (profile as any).notification_preferences as Partial<Prefs> | undefined;
      setPrefs({ ...DEFAULT_PREFS, ...(p || {}) });
    }
  }, [profile]);

  const togglePref = (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    update.mutate({ notification_preferences: next } as any, {
      onSuccess: () => toast.success('Préférence enregistrée'),
      onError: (e: any) => toast.error(e.message),
    });
  };

  const { data: devices = [] } = useQuery({
    queryKey: ['push-subscriptions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, device_label, browser, platform, last_seen_at, status')
        .eq('user_id', user!.id)
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('push_subscriptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['push-subscriptions', user?.id] });
      toast.success('Appareil révoqué');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" />Notifications push</CardTitle>
          <CardDescription>Active les notifications sur ton appareil pour ne rien manquer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EnablePushButton />
          <PwaInstallGuide />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Préférences push</CardTitle>
          <CardDescription>Choisis ce qui déclenche une notification sur tes appareils</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PrefRow label="Nouveau lead reçu" checked={prefs.push_new_lead} onChange={(v) => togglePref('push_new_lead', v)} />
          <PrefRow label="Nouveau message WhatsApp" checked={prefs.push_new_message} onChange={(v) => togglePref('push_new_message', v)} />
          <PrefRow label="Rappels de tâches" checked={prefs.push_reminders} onChange={(v) => togglePref('push_reminders', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Préférences emails</CardTitle>
          <CardDescription>Notifications envoyées sur ton email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PrefRow label="Nouveau lead capturé" checked={prefs.email_new_lead} onChange={(v) => togglePref('email_new_lead', v)} />
          <PrefRow label="Nouveau rendez-vous réservé" checked={prefs.email_new_booking} onChange={(v) => togglePref('email_new_booking', v)} />
          <PrefRow label="Contrat signé" checked={prefs.email_signature_received} onChange={(v) => togglePref('email_signature_received', v)} />
        </CardContent>
      </Card>

      <WorkspaceNotificationPrefs />



      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" />Appareils connectés</CardTitle>
          <CardDescription>{devices.length} appareil(s) lié(s) aux notifications push</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appareil enregistré.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {d.device_label || `${d.browser || 'Navigateur'} · ${d.platform || 'Inconnu'}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Dernière activité : {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('fr-FR') : '—'}
                    </div>
                  </div>
                  <Badge variant={d.status === 'active' ? 'default' : 'outline'} className="mr-2 text-xs">{d.status}</Badge>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => revoke.mutate(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-2">
      <Label className="text-sm cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
