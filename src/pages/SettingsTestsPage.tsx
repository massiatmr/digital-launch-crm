import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, Send, Clock, CheckCircle2, XCircle, Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { requestOneSignalPermission, getOneSignalPermission } from '@/hooks/useOneSignal';
import { toast } from 'sonner';

type Step = 'idle' | 'sending' | 'sent' | 'error';

export default function SettingsTestsPage() {
  const { user } = useAuth();
  const [permission, setPermission] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [delayedStep, setDelayedStep] = useState<Step>('idle');
  const [waStep, setWaStep] = useState<Step>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Track permission live
  useEffect(() => {
    setPermission(getOneSignalPermission() || (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
    const t = setInterval(() => {
      setPermission(getOneSignalPermission() || (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const enable = async () => {
    const ok = await requestOneSignalPermission();
    if (ok) {
      setPermission(true);
      toast.success('Notifications activées');
    } else {
      toast.error('Permission refusée. Vérifie les réglages du navigateur/iOS.');
    }
  };

  const sendNotification = async (
    setter: (s: Step) => void,
    payload: { title: string; body: string; url: string; tag: string }
  ) => {
    if (!user) {
      toast.error('Non connecté');
      return;
    }
    setter('sending');
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-onesignal-notification', {
        body: { user_id: user.id, ...payload },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(JSON.stringify(data));
      setter('sent');
      toast.success('Notif envoyée — regarde ton écran 🔔');
    } catch (e) {
      const msg = (e as Error).message;
      setLastError(msg);
      setter('error');
      toast.error('Échec : ' + msg);
    }
  };

  const sendNow = () =>
    sendNotification(setStep, {
      title: '✅ Test instantané',
      body: 'Si tu vois cette notif, OneSignal marche parfaitement.',
      url: '/settings/tests',
      tag: 'test-now',
    });

  const sendDelayed = async () => {
    setDelayedStep('sending');
    setCountdown(20);
    toast.info('Tu as 20s pour fermer/minimiser l\'app…');
    setTimeout(() => {
      sendNotification(setDelayedStep, {
        title: '⏰ Test différé',
        body: 'Notif reçue alors que l\'app était fermée. Clique pour revenir.',
        url: '/settings/tests',
        tag: 'test-delay',
      });
    }, 20_000);
  };

  const sendWaTest = () =>
    sendNotification(setWaStep, {
      title: '💬 Test WhatsApp (simulation)',
      body: 'Salut ! Je suis intéressé par votre offre.',
      url: '/conversations?highlight=1',
      tag: 'test-wa',
    });

  const StepIcon = ({ s }: { s: Step }) => {
    if (s === 'sending') return <Loader2 className="h-4 w-4 animate-spin" />;
    if (s === 'sent') return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (s === 'error') return <XCircle className="h-4 w-4 text-destructive" />;
    return null;
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* STEP 1 — Activation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
            Activer les notifications
          </CardTitle>
          <CardDescription>
            Autorise les notifs sur cet appareil/navigateur. À refaire sur chaque appareil (Mac, iPhone, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permission ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge className="bg-primary/20 text-primary border-primary/40">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Activées sur cet appareil
              </Badge>
            </div>
          ) : (
            <Button onClick={enable} className="gap-2">
              <Bell className="h-4 w-4" /> Activer maintenant
            </Button>
          )}
        </CardContent>
      </Card>

      {/* STEP 2 — Test direct */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
            Test instantané
          </CardTitle>
          <CardDescription>
            Envoie une notif maintenant. Elle doit s'afficher sur tous tes appareils où les notifs sont activées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={sendNow} disabled={!permission || step === 'sending'} className="gap-2">
            <Send className="h-4 w-4" /> Envoyer maintenant
            <StepIcon s={step} />
          </Button>
          {!permission && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <BellOff className="h-3 w-3" /> Active d'abord les notifs (étape 1)
            </p>
          )}
        </CardContent>
      </Card>

      {/* STEP 3 — Test différé (app fermée) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
            Test app fermée / arrière-plan
          </CardTitle>
          <CardDescription>
            Programme une notif dans 20s. Ferme/minimise l'app pendant ce temps pour vérifier qu'elle arrive même quand l'app n'est pas ouverte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={sendDelayed} disabled={!permission || delayedStep === 'sending'} variant="outline" className="gap-2">
            <Clock className="h-4 w-4" />
            {countdown > 0 ? `Envoi dans ${countdown}s…` : 'Programmer dans 20s'}
            <StepIcon s={delayedStep} />
          </Button>
          {countdown > 0 && (
            <p className="text-xs text-primary flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Ferme ou minimise l'app maintenant !
            </p>
          )}
        </CardContent>
      </Card>

      {/* STEP 4 — Test WhatsApp simulation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">4</span>
            Simuler une notif WhatsApp
          </CardTitle>
          <CardDescription>
            Envoie une notif type "nouveau message". En cliquant dessus, tu seras redirigé vers /conversations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendWaTest} disabled={!permission || waStep === 'sending'} variant="outline" className="gap-2">
            <MessageCircle className="h-4 w-4" /> Simuler message WhatsApp
            <StepIcon s={waStep} />
          </Button>
        </CardContent>
      </Card>

      {/* Erreur globale */}
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

      {/* Aide */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">💡 Conseils si les notifs n'arrivent pas :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>iPhone</strong> : l'app doit être installée sur l'écran d'accueil (PWA), iOS 16.4+, et les notifs autorisées dans Réglages → Notifications.</li>
            <li><strong>Mac/Chrome</strong> : vérifie que les notifs ne sont pas bloquées dans Préférences Système → Notifications → Chrome.</li>
            <li><strong>Safari</strong> : nécessite que le site soit ajouté à l'écran d'accueil/dock.</li>
            <li>Une fois activé sur un appareil, tu reçois automatiquement les vraies notifs WhatsApp et rappels.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
