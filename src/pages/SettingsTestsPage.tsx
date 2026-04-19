import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, Send, Clock, CheckCircle2, XCircle, Loader2, MessageCircle, AlertTriangle, ExternalLink, Mail, Brain, Zap, MessageSquare, Workflow } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { requestOneSignalPermission, getOneSignalPermission } from '@/hooks/useOneSignal';
import { toast } from 'sonner';

type Step = 'idle' | 'sending' | 'sent' | 'error';

const PUBLISHED_URL = 'https://digital-launch-crm.lovable.app';

function isPreviewEnvironment() {
  if (typeof window === 'undefined') return false;
  const isPreviewHost =
    window.location.hostname.includes('id-preview--') ||
    window.location.hostname.includes('lovableproject.com');
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  return isPreviewHost || isInIframe;
}

function StepIcon({ s }: { s: Step }) {
  if (s === 'sending') return <Loader2 className="h-4 w-4 animate-spin" />;
  if (s === 'sent') return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (s === 'error') return <XCircle className="h-4 w-4 text-destructive" />;
  return null;
}

export default function SettingsTestsPage() {
  const { user } = useAuth();
  const [permission, setPermission] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [delayedStep, setDelayedStep] = useState<Step>('idle');
  const [waSimStep, setWaSimStep] = useState<Step>('idle');
  const [waRealStep, setWaRealStep] = useState<Step>('idle');
  const [emailStep, setEmailStep] = useState<Step>('idle');
  const [aiStep, setAiStep] = useState<Step>('idle');
  const [cronStep, setCronStep] = useState<Step>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('Test depuis le CRM ✅');
  const [emailTo, setEmailTo] = useState(user?.email ?? '');
  const inPreview = useMemo(() => isPreviewEnvironment(), []);
  const [diag, setDiag] = useState<{ permission: string; subscriptionId: string | null; optedIn: boolean; swReady: boolean }>({
    permission: 'unknown',
    subscriptionId: null,
    optedIn: false,
    swReady: false,
  });

  useEffect(() => {
    if (user?.email && !emailTo) setEmailTo(user.email);
  }, [user, emailTo]);

  useEffect(() => {
    const refresh = async () => {
      setPermission(getOneSignalPermission() || (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
      try {
        const OneSignal = (window as any).OneSignal;
        const subId = OneSignal?.User?.PushSubscription?.id ?? null;
        const optedIn = Boolean(OneSignal?.User?.PushSubscription?.optedIn);
        const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unknown';
        const reg = await navigator.serviceWorker?.getRegistration();
        setDiag({ permission: perm, subscriptionId: subId, optedIn, swReady: Boolean(reg?.active) });
      } catch {
        // ignore
      }
    };
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const enable = async () => {
    if (inPreview) {
      toast.error('Le preview ne peut pas enregistrer OneSignal. Ouvre la version publiée.');
      return;
    }
    const ok = await requestOneSignalPermission(user?.id);
    if (ok) {
      setPermission(true);
      toast.success('Notifications activées et appareil lié');
    } else {
      toast.error('Permission ok peut-être, mais appareil non lié. Réessaie sur la version publiée.');
    }
  };

  const sendNotification = async (
    setter: (s: Step) => void,
    payload: { title: string; body: string; url: string; tag: string }
  ) => {
    if (!user) return toast.error('Non connecté');
    if (inPreview) {
      setLastError('Le preview Lovable ne peut pas lier cet appareil à OneSignal. Ouvre la version publiée.');
      setter('error');
      return toast.error('Teste sur la version publiée');
    }
    setter('sending');
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-onesignal-notification', {
        body: { user_id: user.id, ...payload },
      });
      if (error) throw new Error(error.message);
      if (data?.ok === false || data?.error) {
        throw new Error(data?.hint ? `${data.error} — ${data.hint}` : data?.error || JSON.stringify(data));
      }
      setter('sent');
      toast.success('Notif envoyée 🔔');
    } catch (e) {
      setLastError((e as Error).message);
      setter('error');
      toast.error('Échec : ' + (e as Error).message);
    }
  };

  const sendNow = () => sendNotification(setStep, { title: '✅ Test instantané', body: 'OneSignal marche.', url: '/settings/tests', tag: 'test-now' });
  const sendDelayed = async () => {
    setDelayedStep('sending');
    setCountdown(20);
    toast.info('Tu as 20s pour fermer/minimiser…');
    setTimeout(() => sendNotification(setDelayedStep, { title: '⏰ Test différé', body: 'App fermée OK', url: '/settings/tests', tag: 'test-delay' }), 20_000);
  };
  const sendWaSim = () => sendNotification(setWaSimStep, { title: '💬 Test WhatsApp (simulation)', body: 'Salut ! Je suis intéressé.', url: '/conversations?highlight=1', tag: 'test-wa' });

  // === Test WhatsApp réel via Meta API ===
  const sendWaReal = async () => {
    if (!waPhone.trim() || !waMessage.trim()) return toast.error('Numéro + message requis');
    setWaRealStep('sending');
    setLastError(null);
    setLastResult(null);
    try {
      // On a besoin d'un lead_id valide. On va chercher (ou créer) un lead "TEST" pour ce numéro.
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', waPhone.trim())
        .maybeSingle();
      let leadId = existing?.id;
      if (!leadId) {
        const { data: newLead, error: insErr } = await supabase
          .from('leads')
          .insert({ name: 'TEST WhatsApp', phone: waPhone.trim(), source: 'manual' })
          .select('id')
          .single();
        if (insErr) throw insErr;
        leadId = newLead.id;
      }
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: leadId, message: waMessage },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setWaRealStep('sent');
      setLastResult(JSON.stringify(data, null, 2));
      toast.success(data?.dry_run ? '🟡 Dry-run (active l\'envoi réel dans Settings)' : '✅ WhatsApp envoyé via Meta API');
    } catch (e) {
      setLastError((e as Error).message);
      setWaRealStep('error');
      toast.error('Échec : ' + (e as Error).message);
    }
  };

  // === Test email transactionnel ===
  const sendEmail = async () => {
    if (!emailTo.trim()) return toast.error('Email destinataire requis');
    setEmailStep('sending');
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          to: emailTo.trim(),
          template: 'booking-confirmation',
          subject: '✅ Test email depuis le CRM',
          data: {
            name: 'Test',
            booking_date: new Date().toLocaleDateString('fr-FR'),
            time_slot: '14:00',
            offer_name: 'Test Offer',
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setEmailStep('sent');
      setLastResult(JSON.stringify(data, null, 2));
      toast.success('📧 Email envoyé (vérifie ta boîte + spam)');
    } catch (e) {
      setLastError((e as Error).message);
      setEmailStep('error');
      toast.error('Échec : ' + (e as Error).message);
    }
  };

  // === Test IA (analyse lead bidon) ===
  const sendAi = async () => {
    setAiStep('sending');
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: {
          mode: 'analyze',
          lead: {
            name: 'Jean Dupont (test)',
            company_name: 'Déménagements Express',
            message: 'Bonjour, je cherche un site web pour ma boîte de déménagement, urgent svp',
            source: 'facebook',
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAiStep('sent');
      setLastResult(JSON.stringify(data, null, 2));
      toast.success('🧠 IA OK — voir résultat ci-dessous');
    } catch (e) {
      setLastError((e as Error).message);
      setAiStep('error');
      toast.error('Échec : ' + (e as Error).message);
    }
  };

  // === Test cron follow-up (déclenche manuellement) ===
  const sendCron = async () => {
    setCronStep('sending');
    setLastError(null);
    try {
      const [a, b] = await Promise.all([
        supabase.functions.invoke('detect-inactive-conversations', { body: {} }),
        supabase.functions.invoke('process-followup-tasks', { body: {} }),
      ]);
      if (a.error) throw new Error('detect: ' + a.error.message);
      if (b.error) throw new Error('process: ' + b.error.message);
      setCronStep('sent');
      setLastResult(JSON.stringify({ detect: a.data, process: b.data }, null, 2));
      toast.success('⚡ Crons exécutés manuellement');
    } catch (e) {
      setLastError((e as Error).message);
      setCronStep('error');
      toast.error('Échec : ' + (e as Error).message);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {inPreview && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" /> Notifs push : test impossible dans le preview
            </CardTitle>
            <CardDescription>
              Les autres tests (WhatsApp, email, IA, cron) fonctionnent dans le preview. Seules les notifs push nécessitent la version publiée.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={PUBLISHED_URL} target="_blank" rel="noreferrer">
                Ouvrir la version publiée <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DIAGNOSTIC */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Diagnostic OneSignal (live)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs font-mono">
          <div>permission: <span className={diag.permission === 'granted' ? 'text-primary' : 'text-destructive'}>{diag.permission}</span></div>
          <div>service worker: <span className={diag.swReady ? 'text-primary' : 'text-destructive'}>{String(diag.swReady)}</span></div>
          <div>optedIn: <span className={diag.optedIn ? 'text-primary' : 'text-muted-foreground'}>{String(diag.optedIn)}</span></div>
          <div className="break-all">subscriptionId: <span className={diag.subscriptionId ? 'text-primary' : 'text-destructive'}>{diag.subscriptionId ?? 'null'}</span></div>
          <div>user_id: <span className="text-muted-foreground">{user?.id ?? 'non connecté'}</span></div>
        </CardContent>
      </Card>

      {/* === NOTIFICATIONS PUSH === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" /> Notifications push
          </CardTitle>
          <CardDescription>Activation + 3 tests de notif.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {permission ? (
            <Badge className="bg-primary/20 text-primary border-primary/40">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Activées sur cet appareil
            </Badge>
          ) : (
            <Button onClick={enable} size="sm" className="gap-2">
              <Bell className="h-4 w-4" /> Activer
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendNow} disabled={!permission || step === 'sending'} size="sm" className="gap-2">
              <Send className="h-3 w-3" /> Test instantané <StepIcon s={step} />
            </Button>
            <Button onClick={sendDelayed} disabled={!permission || delayedStep === 'sending'} size="sm" variant="outline" className="gap-2">
              <Clock className="h-3 w-3" /> {countdown > 0 ? `${countdown}s…` : 'Test différé 20s'} <StepIcon s={delayedStep} />
            </Button>
            <Button onClick={sendWaSim} disabled={!permission || waSimStep === 'sending'} size="sm" variant="outline" className="gap-2">
              <MessageCircle className="h-3 w-3" /> Simu WA <StepIcon s={waSimStep} />
            </Button>
          </div>
          {countdown > 0 && (
            <p className="text-xs text-primary flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Ferme/minimise l'app !
            </p>
          )}
        </CardContent>
      </Card>

      {/* === WHATSAPP RÉEL === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" /> Envoi WhatsApp réel (Meta API)
          </CardTitle>
          <CardDescription>
            Crée un lead "TEST" si besoin et envoie un vrai message via ta config WhatsApp Cloud. Si dry-run actif, aucun message ne part.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="wa-phone" className="text-xs">Numéro (format E.164, ex: +33612345678)</Label>
            <Input id="wa-phone" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+33612345678" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wa-msg" className="text-xs">Message</Label>
            <Input id="wa-msg" value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
          </div>
          <Button onClick={sendWaReal} disabled={waRealStep === 'sending'} size="sm" className="gap-2">
            <Send className="h-3 w-3" /> Envoyer WhatsApp <StepIcon s={waRealStep} />
          </Button>
        </CardContent>
      </Card>

      {/* === EMAIL === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" /> Email transactionnel
          </CardTitle>
          <CardDescription>Envoie un email de test (template booking-confirmation).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="email-to" className="text-xs">Destinataire</Label>
            <Input id="email-to" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="toi@exemple.com" />
          </div>
          <Button onClick={sendEmail} disabled={emailStep === 'sending'} size="sm" className="gap-2">
            <Send className="h-3 w-3" /> Envoyer email <StepIcon s={emailStep} />
          </Button>
        </CardContent>
      </Card>

      {/* === IA === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" /> Analyse IA (Lovable AI Gateway)
          </CardTitle>
          <CardDescription>Lance une analyse Gemini sur un lead bidon pour vérifier que la clé fonctionne.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendAi} disabled={aiStep === 'sending'} size="sm" className="gap-2">
            <Brain className="h-3 w-3" /> Tester l'IA <StepIcon s={aiStep} />
          </Button>
        </CardContent>
      </Card>

      {/* === CRON === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" /> Crons follow-up WhatsApp
          </CardTitle>
          <CardDescription>
            Exécute manuellement <code className="text-xs">detect-inactive-conversations</code> + <code className="text-xs">process-followup-tasks</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendCron} disabled={cronStep === 'sending'} size="sm" className="gap-2">
            <Zap className="h-3 w-3" /> Lancer les crons maintenant <StepIcon s={cronStep} />
          </Button>
        </CardContent>
      </Card>

      {/* Résultat / erreur */}
      {lastResult && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm">Dernier résultat</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto">{lastResult}</pre>
          </CardContent>
        </Card>
      )}
      {lastError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Dernière erreur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono text-destructive/90 whitespace-pre-wrap break-all">{lastError}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
