import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import {
  Mail, Bell, FileSignature, Webhook, Zap, Calendar, Database,
  CheckCircle2, XCircle, Loader2, Send, Brain, Facebook
} from 'lucide-react';

type Status = 'idle' | 'running' | 'success' | 'error';

interface TestResult {
  status: Status;
  message?: string;
  data?: any;
}

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
        <ScrollArea className="max-h-40">
          <pre className="text-muted-foreground whitespace-pre-wrap break-all">
            {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
};

export default function SettingsTestsPage() {
  const { user } = useAuth();
  const { state: pushState, subscribe } = usePushNotifications();
  const isSubscribed = pushState === 'subscribed';

  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [smtpRecipient, setSmtpRecipient] = useState(user?.email || '');
  const [aiLeadName, setAiLeadName] = useState('Marie Dupont');
  const [aiLeadMsg, setAiLeadMsg] = useState('Bonjour, je suis intéressée par votre offre marketing pour mon entreprise de déménagement.');

  const set = (key: string, r: TestResult) => setResults((p) => ({ ...p, [key]: r }));
  const get = (key: string): TestResult => results[key] || { status: 'idle' };

  // ---------- TEST 1: SMTP ----------
  const testSmtp = async () => {
    if (!smtpRecipient) return toast.error('Renseigne un email destinataire');
    set('smtp', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('send-smtp-email', {
        body: {
          to: smtpRecipient,
          subject: '✅ Test SMTP — Digital Launch CRM',
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
            <h1 style="color:#7c3aed">Test SMTP réussi 🎉</h1>
            <p>Si tu lis ce message, ton serveur SMTP est bien configuré.</p>
            <p style="color:#999;font-size:12px">Envoyé depuis la page Tests du CRM — ${new Date().toLocaleString('fr-FR')}</p>
          </div>`,
        },
      });
      if (error) throw error;
      set('smtp', { status: 'success', message: `Email envoyé à ${smtpRecipient}`, data });
      toast.success('Email SMTP envoyé');
    } catch (e: any) {
      set('smtp', { status: 'error', message: e.message, data: e });
      toast.error('Échec SMTP : ' + e.message);
    }
  };

  // ---------- TEST 2: Push notification ----------
  const testPush = async () => {
    set('push', { status: 'running' });
    try {
      if (!isSubscribed) {
        await subscribe();
      }
      // Send a test push via send-push function targeting current user
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: user?.id,
          title: '🧪 Test push — Digital Launch CRM',
          body: 'Si tu vois ce message, les notifications push fonctionnent !',
          url: '/settings/tests',
          tag: 'test-push',
        },
      });
      if (error) throw error;
      set('push', { status: 'success', message: 'Notification envoyée — vérifie ton appareil', data });
    } catch (e: any) {
      set('push', { status: 'error', message: e.message });
    }
  };

  // ---------- TEST 3: Notify new lead (full flow) ----------
  const testNotifyLead = async () => {
    set('notifyLead', { status: 'running' });
    try {
      // Create a temp lead
      const { data: lead, error: insertErr } = await supabase
        .from('leads')
        .insert({
          name: '[TEST] ' + aiLeadName,
          email: 'test@example.com',
          phone: '+33612345678',
          company_name: 'Test Société',
          source: 'manual' as const,
          message: aiLeadMsg,
          status: 'new' as const,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      const { data, error } = await supabase.functions.invoke('notify-new-lead', {
        body: { lead_id: lead.id },
      });
      if (error) throw error;

      set('notifyLead', {
        status: 'success',
        message: `Lead test créé (${lead.id.slice(0, 8)}...) — push + email déclenchés`,
        data,
      });
      toast.success('Notifications déclenchées');
    } catch (e: any) {
      set('notifyLead', { status: 'error', message: e.message, data: e });
    }
  };

  // ---------- TEST 4: AI Lead Analysis ----------
  const testAiAnalysis = async () => {
    set('ai', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: {
          name: aiLeadName,
          message: aiLeadMsg,
          source: 'manual',
        },
      });
      if (error) throw error;
      set('ai', { status: 'success', message: 'Analyse IA réussie', data });
    } catch (e: any) {
      set('ai', { status: 'error', message: e.message, data: e });
    }
  };

  // ---------- TEST 5: Facebook webhook subscription ----------
  const testFbSubscription = async () => {
    set('fb', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('fb-check-subscription', { body: {} });
      if (error) throw error;
      set('fb', { status: 'success', message: 'Statut récupéré', data });
    } catch (e: any) {
      set('fb', { status: 'error', message: e.message, data: e });
    }
  };

  // ---------- TEST 6: Check availability ----------
  const testAvailability = async () => {
    set('avail', { status: 'running' });
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const date = tomorrow.toISOString().split('T')[0];
      const { data, error } = await supabase.functions.invoke('check-availability', {
        body: { date, owner_id: user?.id },
      });
      if (error) throw error;
      set('avail', { status: 'success', message: `Créneaux pour ${date}`, data });
    } catch (e: any) {
      set('avail', { status: 'error', message: e.message, data: e });
    }
  };

  // ---------- TEST 7: Due reminders cron ----------
  const testReminders = async () => {
    set('reminders', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('check-due-reminders', { body: {} });
      if (error) throw error;
      set('reminders', { status: 'success', message: 'Cron exécuté', data });
    } catch (e: any) {
      set('reminders', { status: 'error', message: e.message, data: e });
    }
  };

  // ---------- TEST 8: DB connection ----------
  const testDb = async () => {
    set('db', { status: 'running' });
    try {
      const [{ count: leads }, { count: clients }, { count: bookings }] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
      ]);
      set('db', {
        status: 'success',
        message: 'Connexion BDD OK',
        data: { leads, clients, bookings },
      });
    } catch (e: any) {
      set('db', { status: 'error', message: e.message });
    }
  };

  // ---------- TEST 9: Signature flow (create token) ----------
  const testSignature = async () => {
    set('sign', { status: 'running' });
    try {
      const { data: clients } = await supabase.from('clients').select('id, name').limit(1);
      if (!clients || clients.length === 0) {
        throw new Error('Aucun client en base — crée-en un d\'abord');
      }
      const client = clients[0];
      const { data: token, error } = await supabase
        .from('contract_signatures')
        .insert({
          client_id: client.id,
          contract_data: { test: true, generated_at: new Date().toISOString() } as any,
        })
        .select('token')
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/sign/${token.token}`;
      set('sign', {
        status: 'success',
        message: `Lien de signature créé pour "${client.name}"`,
        data: url,
      });
    } catch (e: any) {
      set('sign', { status: 'error', message: e.message });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          Centre de Tests
        </h1>
        <p className="text-muted-foreground">
          Vérifie en un clic que toutes tes intégrations et automatisations fonctionnent.
        </p>
      </div>

      <Tabs defaultValue="emails" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="emails">📧 Emails</TabsTrigger>
          <TabsTrigger value="notifications">🔔 Notifs</TabsTrigger>
          <TabsTrigger value="integrations">🔗 Intégrations</TabsTrigger>
          <TabsTrigger value="ai">🤖 IA</TabsTrigger>
          <TabsTrigger value="system">⚙️ Système</TabsTrigger>
        </TabsList>

        {/* EMAILS */}
        <TabsContent value="emails" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />SMTP — Email transactionnel</CardTitle>
                  <CardDescription>Envoie un email de test via ton serveur SMTP perso.</CardDescription>
                </div>
                <StatusBadge status={get('smtp').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="smtp-to">Email destinataire</Label>
                <Input id="smtp-to" type="email" value={smtpRecipient} onChange={(e) => setSmtpRecipient(e.target.value)} placeholder="toi@exemple.com" />
              </div>
              <Button onClick={testSmtp} disabled={get('smtp').status === 'running'}>
                <Send className="w-4 h-4 mr-2" />Envoyer email test
              </Button>
              <ResultBlock result={get('smtp')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Notification nouveau lead</CardTitle>
                  <CardDescription>Crée un lead [TEST] et déclenche le flux complet (push + email).</CardDescription>
                </div>
                <StatusBadge status={get('notifyLead').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testNotifyLead} disabled={get('notifyLead').status === 'running'}>
                <Zap className="w-4 h-4 mr-2" />Lancer le flux complet
              </Button>
              <ResultBlock result={get('notifyLead')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Notifications Push</CardTitle>
                  <CardDescription>
                    Statut : {isSubscribed ? <span className="text-primary">Abonné ✓</span> : <span className="text-muted-foreground">Non abonné</span>}
                  </CardDescription>
                </div>
                <StatusBadge status={get('push').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testPush} disabled={get('push').status === 'running'}>
                <Bell className="w-4 h-4 mr-2" />{isSubscribed ? 'Envoyer notif test' : 'S\'abonner + tester'}
              </Button>
              <ResultBlock result={get('push')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTÉGRATIONS */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Facebook className="w-5 h-5" />Facebook Lead Ads — Webhook</CardTitle>
                  <CardDescription>Vérifie l'abonnement de la page aux leads Facebook.</CardDescription>
                </div>
                <StatusBadge status={get('fb').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testFbSubscription} disabled={get('fb').status === 'running'}>
                <Webhook className="w-4 h-4 mr-2" />Vérifier l'abonnement
              </Button>
              <ResultBlock result={get('fb')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Google Calendar — Disponibilités</CardTitle>
                  <CardDescription>Récupère les créneaux libres de demain via Google FreeBusy.</CardDescription>
                </div>
                <StatusBadge status={get('avail').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testAvailability} disabled={get('avail').status === 'running'}>
                <Calendar className="w-4 h-4 mr-2" />Vérifier les créneaux
              </Button>
              <ResultBlock result={get('avail')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5" />E-Signature</CardTitle>
                  <CardDescription>Génère un lien de signature de test pour le 1er client en base.</CardDescription>
                </div>
                <StatusBadge status={get('sign').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testSignature} disabled={get('sign').status === 'running'}>
                <FileSignature className="w-4 h-4 mr-2" />Générer lien signature
              </Button>
              {get('sign').status === 'success' && typeof get('sign').data === 'string' && (
                <a href={get('sign').data} target="_blank" rel="noreferrer" className="text-primary text-sm underline block">
                  → Ouvrir la page de signature
                </a>
              )}
              <ResultBlock result={get('sign')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* IA */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" />Analyse IA d'un lead</CardTitle>
                  <CardDescription>Teste le scoring + résumé + angle de vente via Gemini.</CardDescription>
                </div>
                <StatusBadge status={get('ai').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Nom du lead</Label>
                <Input value={aiLeadName} onChange={(e) => setAiLeadName(e.target.value)} />
              </div>
              <div>
                <Label>Message du lead</Label>
                <Input value={aiLeadMsg} onChange={(e) => setAiLeadMsg(e.target.value)} />
              </div>
              <Button onClick={testAiAnalysis} disabled={get('ai').status === 'running'}>
                <Brain className="w-4 h-4 mr-2" />Analyser
              </Button>
              <ResultBlock result={get('ai')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYSTÈME */}
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />Base de données</CardTitle>
                  <CardDescription>Compte les enregistrements pour vérifier la connexion + RLS.</CardDescription>
                </div>
                <StatusBadge status={get('db').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testDb} disabled={get('db').status === 'running'}>
                <Database className="w-4 h-4 mr-2" />Tester la connexion
              </Button>
              <ResultBlock result={get('db')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Cron — Rappels dus</CardTitle>
                  <CardDescription>Force l'exécution du cron qui envoie les push de rappels.</CardDescription>
                </div>
                <StatusBadge status={get('reminders').status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={testReminders} disabled={get('reminders').status === 'running'}>
                <Zap className="w-4 h-4 mr-2" />Exécuter le cron
              </Button>
              <ResultBlock result={get('reminders')} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
