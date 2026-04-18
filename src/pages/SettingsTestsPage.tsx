import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications, getOrCreateDeviceId } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import {
  Mail, Bell, FileSignature, Webhook, Zap, Calendar, Database,
  CheckCircle2, XCircle, Loader2, Send, Brain, Facebook, Smartphone, Trash2, Clock,
  CheckSquare, Square, RefreshCw, Wrench, MessageCircle,
} from 'lucide-react';

type Status = 'idle' | 'running' | 'success' | 'error';

type PushDevice = {
  id: string;
  device_info: string | null;
  device_id: string | null;
  device_label: string | null;
  platform: string | null;
  browser: string | null;
  is_standalone: boolean | null;
  endpoint: string;
  status: string | null;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  created_at: string;
};

type DeliveryLog = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  provider_status: number | null;
  device_label: string | null;
  title: string | null;
  body_preview: string | null;
  error_message: string | null;
};

interface TestResult { status: Status; message?: string; data?: any; }

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === 'idle') return <Badge variant="outline">En attente</Badge>;
  if (status === 'running') return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />En cours</Badge>;
  if (status === 'success') return <Badge className="bg-primary/20 text-primary border-primary/40"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
  return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Échec</Badge>;
};

const ResultBlock = ({ result }: { result: TestResult }) => {
  if (result.status === 'idle') return null;
  return (
    <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono">
      {result.message && <p className="text-foreground/80 mb-2">{result.message}</p>}
      {result.data && (
        <ScrollArea className="max-h-60">
          <pre className="text-muted-foreground whitespace-pre-wrap break-all">
            {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
};

function relTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}j`;
}

function deviceIcon(platform?: string | null) {
  if (!platform) return '🌐';
  if (/iOS/i.test(platform)) return '📱';
  if (/Android/i.test(platform)) return '🤖';
  if (/macOS/i.test(platform)) return '💻';
  if (/Windows/i.test(platform)) return '🖥️';
  return '🌐';
}

export default function SettingsTestsPage() {
  const { user } = useAuth();
  const { state: pushState, subscribe, deviceId: currentDeviceId } = usePushNotifications();
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [smtpRecipient, setSmtpRecipient] = useState(user?.email || '');
  const [aiLeadName, setAiLeadName] = useState('Marie Dupont');
  const [aiLeadMsg, setAiLeadMsg] = useState('Bonjour, je suis intéressée par votre offre marketing.');
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [delaySec, setDelaySec] = useState(10);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentSubscriptionEndpoint, setCurrentSubscriptionEndpoint] = useState<string | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  const isPreview = pushState === 'preview';
  const dedupedDevices = useMemo(() => {
    const seen = new Set<string>();
    return devices.filter((d) => {
      if (seen.has(d.endpoint)) return false;
      seen.add(d.endpoint);
      return true;
    });
  }, [devices]);
  const selectedCount = selectedDeviceIds.length;

  const set = (key: string, r: TestResult) => setResults((p) => ({ ...p, [key]: r }));
  const get = (key: string): TestResult => results[key] || { status: 'idle' };

  const getPushRegistration = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    return (await navigator.serviceWorker.getRegistration('/service-worker.js'))
      ?? (await navigator.serviceWorker.getRegistration())
      ?? null;
  };

  const loadCurrentSubscription = async () => {
    try {
      const reg = await getPushRegistration();
      if (!reg) { setCurrentSubscriptionEndpoint(null); return; }
      const sub = await reg.pushManager.getSubscription();
      setCurrentSubscriptionEndpoint(sub?.endpoint ?? null);
    } catch { setCurrentSubscriptionEndpoint(null); }
  };

  const loadDevices = async () => {
    if (!user) { setDevices([]); return; }
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, device_info, device_id, device_label, platform, browser, is_standalone, endpoint, status, last_seen_at, last_success_at, last_failure_at, last_error, created_at')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false, nullsFirst: false });
    if (error) {
      set('pushDevices', { status: 'error', message: error.message });
      return;
    }
    setDevices((data || []) as any);
  };

  const loadLogs = async () => {
    if (!user) { setLogs([]); return; }
    const { data, error } = await supabase
      .from('push_delivery_logs')
      .select('id, created_at, source, status, provider_status, device_label, title, body_preview, error_message')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error) setLogs((data || []) as any);
  };

  useEffect(() => {
    Promise.all([loadDevices(), loadCurrentSubscription(), loadLogs()]);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      loadDevices();
      loadLogs();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    setSelectedDeviceIds((prev) => {
      const available = new Set(dedupedDevices.map((d) => d.id));
      const next = prev.filter((id) => available.has(id));
      if (next.length === 0 && dedupedDevices.length > 0) return dedupedDevices.map((d) => d.id);
      return next;
    });
  }, [dedupedDevices]);

  const deleteDevice = async (id: string, endpoint?: string) => {
    const isCurrent = !!endpoint && endpoint === currentSubscriptionEndpoint;
    try {
      if (isCurrent) {
        const reg = await getPushRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub?.endpoint === endpoint) await sub.unsubscribe();
        setCurrentSubscriptionEndpoint(null);
      }
      const { error } = await supabase.from('push_subscriptions').delete().eq('id', id);
      if (error) throw error;
      toast.success(isCurrent ? 'Cet appareil est désabonné' : 'Appareil supprimé');
      await Promise.all([loadDevices(), loadCurrentSubscription()]);
    } catch (e: any) {
      toast.error(e.message || 'Échec du désabonnement');
    }
  };

  const repairCurrentDevice = async () => {
    set('repair', { status: 'running' });
    try {
      const reg = await getPushRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await subscribe();
      await Promise.all([loadDevices(), loadCurrentSubscription(), loadLogs()]);
      set('repair', { status: 'success', message: 'Souscription régénérée pour cet appareil' });
    } catch (e: any) {
      set('repair', { status: 'error', message: e.message });
    }
  };

  const toggleDeviceSelection = (id: string) =>
    setSelectedDeviceIds((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);
  const selectAllDevices = () => setSelectedDeviceIds(dedupedDevices.map((d) => d.id));
  const clearSelectedDevices = () => setSelectedDeviceIds([]);

  const sendPushTo = async (mode: 'all' | 'selected' | 'current', label: string, key: string) => {
    set(key, { status: 'running' });
    try {
      let body: any = {
        user_id: user?.id,
        title: '🧪 Test push — Digital Launch CRM',
        body: `${label} · ${new Date().toLocaleTimeString('fr-FR')}`,
        url: '/settings/tests',
        tag: 'test-' + key,
        source: 'manual_test',
      };
      if (mode === 'selected') body.subscription_ids = selectedDeviceIds;
      if (mode === 'current') {
        const did = getOrCreateDeviceId();
        body.device_ids = [did];
      }
      const { data, error } = await supabase.functions.invoke('send-push', { body });
      if (error) throw error;
      set(key, {
        status: data?.failed > 0 && data?.sent === 0 ? 'error' : 'success',
        message: `Envoyé: ${data?.sent ?? 0} · Échecs: ${data?.failed ?? 0} · Expirés: ${data?.expired_cleaned ?? 0}`,
        data,
      });
      await Promise.all([loadDevices(), loadLogs()]);
    } catch (e: any) {
      set(key, { status: 'error', message: e.message, data: e });
    }
  };

  const testPushDelayed = async () => {
    set('pushDelayed', { status: 'running', message: `Tu as ${delaySec}s pour fermer l'app sur ton mobile…` });
    setCountdown(delaySec);
    const interval = setInterval(() => setCountdown((c) => (c === null || c <= 1 ? null : c - 1)), 1000);
    setTimeout(async () => {
      clearInterval(interval);
      setCountdown(null);
      await sendPushTo(selectedCount > 0 ? 'selected' : 'all', 'Test mobile différé', 'pushDelayed');
    }, delaySec * 1000);
  };

  const testLocalNotification = async () => {
    set('pushLocal', { status: 'running' });
    try {
      if (!('Notification' in window)) throw new Error('API Notification absente');
      if (Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') throw new Error('Permission refusée');
      } else if (Notification.permission === 'denied') {
        throw new Error('Permission DENIED — débloque dans les réglages du navigateur');
      }
      const reg = await getPushRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification('🧪 Test local — Digital Launch', {
          body: 'Notification locale via Service Worker',
          icon: '/icon-192x192.png',
          tag: 'test-local-' + Date.now(),
        });
      } else {
        new Notification('🧪 Test local', { body: 'Via API Notification', icon: '/icon-192x192.png' });
      }
      set('pushLocal', { status: 'success', message: 'Notification locale déclenchée' });
    } catch (e: any) {
      set('pushLocal', { status: 'error', message: e.message });
    }
  };

  const simulateWhatsAppInbound = async () => {
    set('waSim', { status: 'running' });
    try {
      // Use existing lead if any, else create a temporary one.
      const { data: existing } = await supabase
        .from('leads').select('id, name').eq('owner_id', user?.id).limit(1);
      let leadId = existing?.[0]?.id;
      let leadName = existing?.[0]?.name || 'Lead test';
      if (!leadId) {
        const { data: created, error: cErr } = await supabase.from('leads').insert({
          name: '[TEST WA] Marie',
          phone: '+33600000000',
          source: 'manual' as const,
          status: 'new' as const,
        }).select('id, name').single();
        if (cErr) throw cErr;
        leadId = created.id;
        leadName = created.name;
      }
      // 1) Insert inbound message (mimics webhook behavior).
      const { error: mErr } = await supabase.from('whatsapp_messages').insert({
        lead_id: leadId,
        direction: 'inbound' as const,
        content: `[TEST] message simulé à ${new Date().toLocaleTimeString('fr-FR')}`,
        status: 'received',
      } as any);
      if (mErr) throw mErr;
      // 2) Trigger push exactly like webhook.
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: user?.id,
          title: `💬 ${leadName} a répondu`,
          body: 'Message simulé — vérifie tes appareils',
          url: `/conversations?lead=${leadId}`,
          tag: `wa-${leadId}`,
          source: 'whatsapp_inbound',
        },
      });
      if (error) throw error;
      set('waSim', {
        status: data?.sent > 0 ? 'success' : 'error',
        message: `Push envoyés: ${data?.sent ?? 0} / ${data?.results?.length ?? 0}`,
        data,
      });
      await loadLogs();
    } catch (e: any) {
      set('waSim', { status: 'error', message: e.message });
    }
  };

  const testSmtp = async () => {
    if (!smtpRecipient) return toast.error('Renseigne un email destinataire');
    set('smtp', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('send-smtp-email', {
        body: {
          to: smtpRecipient,
          subject: '✅ Test SMTP — Digital Launch CRM',
          html: `<p>Test SMTP réussi — ${new Date().toLocaleString('fr-FR')}</p>`,
        },
      });
      if (error) throw error;
      set('smtp', { status: 'success', message: `Email envoyé à ${smtpRecipient}`, data });
    } catch (e: any) { set('smtp', { status: 'error', message: e.message }); }
  };

  const testNotifyLead = async () => {
    set('notifyLead', { status: 'running' });
    try {
      const { data: lead, error: insertErr } = await supabase.from('leads').insert({
        name: '[TEST] ' + aiLeadName,
        email: 'test@example.com', phone: '+33612345678',
        source: 'manual' as const, message: aiLeadMsg, status: 'new' as const,
      }).select().single();
      if (insertErr) throw insertErr;
      const { data, error } = await supabase.functions.invoke('notify-new-lead', { body: { lead_id: lead.id } });
      if (error) throw error;
      set('notifyLead', { status: 'success', message: `Lead test créé (${lead.id.slice(0, 8)}…)`, data });
    } catch (e: any) { set('notifyLead', { status: 'error', message: e.message }); }
  };

  const testAiAnalysis = async () => {
    set('ai', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: { name: aiLeadName, message: aiLeadMsg, source: 'manual' },
      });
      if (error) throw error;
      set('ai', { status: 'success', message: 'Analyse IA réussie', data });
    } catch (e: any) { set('ai', { status: 'error', message: e.message }); }
  };

  const testFbSubscription = async () => {
    set('fb', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('fb-check-subscription', { body: {} });
      if (error) throw error;
      set('fb', { status: 'success', message: 'Statut récupéré', data });
    } catch (e: any) { set('fb', { status: 'error', message: e.message }); }
  };

  const testAvailability = async () => {
    set('avail', { status: 'running' });
    try {
      const t = new Date(); t.setDate(t.getDate() + 1);
      const date = t.toISOString().split('T')[0];
      const { data, error } = await supabase.functions.invoke('check-availability', { body: { date, owner_id: user?.id } });
      if (error) throw error;
      set('avail', { status: 'success', message: `Créneaux pour ${date}`, data });
    } catch (e: any) { set('avail', { status: 'error', message: e.message }); }
  };

  const testReminders = async () => {
    set('reminders', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('check-due-reminders', { body: {} });
      if (error) throw error;
      set('reminders', { status: 'success', message: 'Cron exécuté', data });
    } catch (e: any) { set('reminders', { status: 'error', message: e.message }); }
  };

  const testDb = async () => {
    set('db', { status: 'running' });
    try {
      const [{ count: leads }, { count: clients }, { count: bookings }] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
      ]);
      set('db', { status: 'success', message: 'Connexion BDD OK', data: { leads, clients, bookings } });
    } catch (e: any) { set('db', { status: 'error', message: e.message }); }
  };

  const testSignature = async () => {
    set('sign', { status: 'running' });
    try {
      const { data: clients } = await supabase.from('clients').select('id, name').limit(1);
      if (!clients || clients.length === 0) throw new Error('Aucun client en base');
      const c = clients[0];
      const { data: token, error } = await supabase.from('contract_signatures').insert({
        client_id: c.id,
        contract_data: { test: true, generated_at: new Date().toISOString() } as any,
      }).select('token').single();
      if (error) throw error;
      set('sign', { status: 'success', message: `Lien signature pour "${c.name}"`, data: `${window.location.origin}/sign/${token.token}` });
    } catch (e: any) { set('sign', { status: 'error', message: e.message }); }
  };

  return (
    <div className="container mx-auto p-2 sm:p-6 max-w-5xl">
      <div className="mb-4 sm:mb-8 px-1">
        <h1 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
          <Zap className="w-5 h-5 sm:w-8 sm:h-8 text-primary" />
          Centre de Tests
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground">
          Diagnostic complet des notifications + intégrations.
        </p>
      </div>

      <Tabs defaultValue="notifications" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-max md:grid md:grid-cols-5 md:w-full h-auto">
            <TabsTrigger value="notifications" className="text-xs sm:text-sm whitespace-nowrap">🔔 Notifs</TabsTrigger>
            <TabsTrigger value="emails" className="text-xs sm:text-sm whitespace-nowrap">📧 Emails</TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs sm:text-sm whitespace-nowrap">🔗 Intég.</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs sm:text-sm whitespace-nowrap">🤖 IA</TabsTrigger>
            <TabsTrigger value="system" className="text-xs sm:text-sm whitespace-nowrap">⚙️ Système</TabsTrigger>
          </TabsList>
        </ScrollArea>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-4">
          {isPreview && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">⚠️ Push indisponible dans le preview</p>
              <p className="text-foreground/70 text-xs mt-1">
                Ouvre la version publiée :{' '}
                <a href="https://digital-launch-crm.lovable.app/settings/tests" target="_blank" rel="noreferrer" className="underline font-medium text-primary">
                  digital-launch-crm.lovable.app
                </a>
              </p>
            </div>
          )}

          {/* Current device */}
          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" />Cet appareil</CardTitle>
                  <CardDescription>
                    Statut : {pushState === 'subscribed' ? <span className="text-primary">Abonné ✓</span> : <span className="text-muted-foreground">Non abonné</span>}
                    {' · '}device_id: <code className="text-[10px]">{currentDeviceId?.slice(0, 12)}…</code>
                  </CardDescription>
                </div>
                <StatusBadge status={get('repair').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={subscribe} disabled={pushState === 'subscribed' || pushState === 'denied' || pushState === 'preview'}>
                  <Bell className="w-4 h-4 mr-2" />Activer sur cet appareil
                </Button>
                <Button onClick={testLocalNotification} disabled={get('pushLocal').status === 'running'} variant="secondary">
                  <Bell className="w-4 h-4 mr-2" />Test affichage local
                </Button>
                <Button onClick={() => sendPushTo('current', 'Backend → cet appareil', 'pushCurrent')} variant="default" disabled={get('pushCurrent').status === 'running'}>
                  <Send className="w-4 h-4 mr-2" />Envoyer backend → cet appareil
                </Button>
                <Button onClick={repairCurrentDevice} variant="outline" disabled={get('repair').status === 'running'}>
                  <Wrench className="w-4 h-4 mr-2" />Réparer la souscription
                </Button>
              </div>
              <ResultBlock result={get('pushLocal')} />
              <ResultBlock result={get('pushCurrent')} />
              <ResultBlock result={get('repair')} />
            </CardContent>
          </Card>

          {/* Devices */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" />Appareils enregistrés ({dedupedDevices.length})</CardTitle>
                  <CardDescription>État de santé en direct. Coche pour cibler des envois.</CardDescription>
                </div>
                <Button size="sm" variant="ghost" onClick={() => Promise.all([loadDevices(), loadCurrentSubscription(), loadLogs()])}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <Button size="sm" variant="outline" onClick={selectAllDevices} disabled={dedupedDevices.length === 0}>
                  <CheckSquare className="w-4 h-4 mr-2" />Tout sélectionner
                </Button>
                <Button size="sm" variant="outline" onClick={clearSelectedDevices} disabled={selectedCount === 0}>
                  <Square className="w-4 h-4 mr-2" />Tout désélectionner
                </Button>
                <Badge variant="outline">{selectedCount} sélectionné(s)</Badge>
                <div className="flex-1" />
                <Button size="sm" onClick={() => sendPushTo('all', 'Test à tous', 'pushAll')} disabled={get('pushAll').status === 'running' || dedupedDevices.length === 0}>
                  <Send className="w-4 h-4 mr-2" />Envoyer à tous
                </Button>
                <Button size="sm" variant="secondary" onClick={() => sendPushTo('selected', 'Test ciblé', 'pushSelected')} disabled={get('pushSelected').status === 'running' || selectedCount === 0}>
                  <Send className="w-4 h-4 mr-2" />Envoyer aux sélectionnés
                </Button>
              </div>
              <ResultBlock result={get('pushAll')} />
              <ResultBlock result={get('pushSelected')} />
              {dedupedDevices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun appareil. Active les notifications.</p>
              ) : (
                dedupedDevices.map((d) => {
                  const isCurrent = d.endpoint === currentSubscriptionEndpoint || d.device_id === currentDeviceId;
                  const isSelected = selectedDeviceIds.includes(d.id);
                  const healthColor = d.status === 'invalid' ? 'destructive' : d.last_failure_at && (!d.last_success_at || d.last_failure_at > d.last_success_at) ? 'secondary' : 'outline';
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-black/30 border border-white/5">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button type="button" onClick={() => toggleDeviceSelection(d.id)} className="shrink-0 text-primary">
                          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                        </button>
                        <span className="text-2xl">{deviceIcon(d.platform)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{d.device_label || d.platform || 'Appareil'}</p>
                            {isCurrent && <Badge variant="outline">Cet appareil</Badge>}
                            <Badge variant={healthColor as any}>{d.status || 'active'}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Vu il y a {relTime(d.last_seen_at)} · ✅ {relTime(d.last_success_at)} · ❌ {relTime(d.last_failure_at)}
                          </p>
                          {d.last_error && (
                            <p className="text-[10px] text-destructive truncate">{d.last_error}</p>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteDevice(d.id, d.endpoint)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Delayed test */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" />Test push différé (app fermée)</CardTitle>
                  <CardDescription>Ferme l'app sur ton mobile pendant le compte à rebours.</CardDescription>
                </div>
                <StatusBadge status={get('pushDelayed').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="delay">Délai (sec)</Label>
                  <Input id="delay" type="number" min={3} max={120} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value) || 10)} />
                </div>
                <Button onClick={testPushDelayed} disabled={get('pushDelayed').status === 'running' || !user} className="shrink-0">
                  {countdown !== null ? <><Clock className="w-4 h-4 mr-2 animate-pulse" />{countdown}s</> : <><Smartphone className="w-4 h-4 mr-2" />Lancer</>}
                </Button>
              </div>
              <ResultBlock result={get('pushDelayed')} />
            </CardContent>
          </Card>

          {/* WhatsApp simulation */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />Simuler WhatsApp entrant</CardTitle>
                  <CardDescription>Insère un message inbound + déclenche le push exactement comme le webhook.</CardDescription>
                </div>
                <StatusBadge status={get('waSim').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={simulateWhatsAppInbound} disabled={get('waSim').status === 'running' || !user}>
                <Zap className="w-4 h-4 mr-2" />Simuler maintenant
              </Button>
              <ResultBlock result={get('waSim')} />
            </CardContent>
          </Card>

          {/* Delivery logs */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />Historique des envois ({logs.length})</CardTitle>
                  <CardDescription>30 derniers envois backend, par appareil et par source.</CardDescription>
                </div>
                <Button size="sm" variant="ghost" onClick={loadLogs}><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun envoi enregistré pour le moment.</p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="text-xs p-2 rounded border border-white/5 bg-black/30 flex items-start gap-2">
                    <span className="shrink-0">
                      {l.status === 'sent' ? '✅' : l.status === 'expired' ? '⛔' : '❌'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{l.source}</Badge>
                        <span className="font-medium truncate">{l.device_label || '—'}</span>
                        <span className="text-muted-foreground">· {new Date(l.created_at).toLocaleTimeString('fr-FR')}</span>
                        {l.provider_status && <span className="text-muted-foreground">· HTTP {l.provider_status}</span>}
                      </div>
                      <p className="text-muted-foreground truncate">{l.title} — {l.body_preview}</p>
                      {l.error_message && <p className="text-destructive truncate">{l.error_message}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAILS */}
        <TabsContent value="emails" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />SMTP — Email transactionnel</CardTitle>
                  <CardDescription>Envoie un email de test.</CardDescription>
                </div>
                <StatusBadge status={get('smtp').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="smtp-to">Email destinataire</Label>
                <Input id="smtp-to" type="email" value={smtpRecipient} onChange={(e) => setSmtpRecipient(e.target.value)} />
              </div>
              <Button onClick={testSmtp} disabled={get('smtp').status === 'running'}>
                <Send className="w-4 h-4 mr-2" />Envoyer email test
              </Button>
              <ResultBlock result={get('smtp')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Notification nouveau lead</CardTitle>
                  <CardDescription>Crée un lead [TEST] et déclenche le flux complet.</CardDescription>
                </div>
                <StatusBadge status={get('notifyLead').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testNotifyLead} disabled={get('notifyLead').status === 'running'}>
                <Zap className="w-4 h-4 mr-2" />Lancer le flux
              </Button>
              <ResultBlock result={get('notifyLead')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTEGRATIONS */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Facebook className="w-5 h-5" />Facebook Webhook</CardTitle>
                  <CardDescription>Vérifie l'abonnement.</CardDescription>
                </div>
                <StatusBadge status={get('fb').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testFbSubscription} disabled={get('fb').status === 'running'}><Webhook className="w-4 h-4 mr-2" />Vérifier</Button>
              <ResultBlock result={get('fb')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Google Calendar</CardTitle>
                  <CardDescription>Créneaux de demain.</CardDescription>
                </div>
                <StatusBadge status={get('avail').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testAvailability} disabled={get('avail').status === 'running'}><Calendar className="w-4 h-4 mr-2" />Vérifier</Button>
              <ResultBlock result={get('avail')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5" />E-Signature</CardTitle>
                  <CardDescription>Lien de signature test.</CardDescription>
                </div>
                <StatusBadge status={get('sign').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testSignature} disabled={get('sign').status === 'running'}><FileSignature className="w-4 h-4 mr-2" />Générer</Button>
              {get('sign').status === 'success' && typeof get('sign').data === 'string' && (
                <a href={get('sign').data} target="_blank" rel="noreferrer" className="text-primary text-sm underline block">→ Ouvrir</a>
              )}
              <ResultBlock result={get('sign')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* IA */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" />Analyse IA</CardTitle>
                  <CardDescription>Scoring + résumé.</CardDescription>
                </div>
                <StatusBadge status={get('ai').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Nom</Label><Input value={aiLeadName} onChange={(e) => setAiLeadName(e.target.value)} /></div>
              <div><Label>Message</Label><Input value={aiLeadMsg} onChange={(e) => setAiLeadMsg(e.target.value)} /></div>
              <Button onClick={testAiAnalysis} disabled={get('ai').status === 'running'}><Brain className="w-4 h-4 mr-2" />Analyser</Button>
              <ResultBlock result={get('ai')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYSTÈME */}
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div><CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />Base de données</CardTitle></div>
                <StatusBadge status={get('db').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testDb} disabled={get('db').status === 'running'}><Database className="w-4 h-4 mr-2" />Tester</Button>
              <ResultBlock result={get('db')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div><CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Cron rappels</CardTitle></div>
                <StatusBadge status={get('reminders').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testReminders} disabled={get('reminders').status === 'running'}><Zap className="w-4 h-4 mr-2" />Exécuter</Button>
              <ResultBlock result={get('reminders')} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
