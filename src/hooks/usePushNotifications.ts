import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

let CACHED_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

async function getVapidPublicKey(): Promise<string> {
  if (CACHED_VAPID_KEY) return CACHED_VAPID_KEY;
  const { data, error } = await supabase.functions.invoke('get-vapid-public-key');
  if (error) throw new Error('Impossible de récupérer la clé VAPID : ' + error.message);
  CACHED_VAPID_KEY = (data as any)?.publicKey || '';
  return CACHED_VAPID_KEY;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreviewHost =
    window.location.hostname.includes('id-preview--') ||
    window.location.hostname.includes('lovableproject.com');
  return isInIframe || isPreviewHost;
}

export type PushState = 'unsupported' | 'preview' | 'default' | 'denied' | 'granted' | 'subscribed';

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('unsupported');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }

    if (isPreviewEnvironment()) {
      setState('preview');
      return;
    }

    const perm = Notification.permission;
    if (perm === 'denied') {
      setState('denied');
      return;
    }

    // Check existing subscription
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : perm === 'granted' ? 'granted' : 'default');
      });
    }).catch(err => {
      console.error('SW ready failed:', err);
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!user) {
      toast.error('Tu dois être connecté');
      return;
    }
    if (isPreviewEnvironment()) {
      toast.error('Les notifications push ne fonctionnent pas dans le preview Lovable. Ouvre la version publiée : digital-launch-crm.lovable.app');
      return;
    }
    setLoading(true);
    try {
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        toast.error('Clé VAPID introuvable côté serveur');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        toast.error('Permission refusée pour les notifications');
        return;
      }
      setState('granted');

      // Make sure SW is registered (may not be if first visit)
      let registration = await navigator.serviceWorker.getRegistration('/service-worker.js');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/service-worker.js');
      }
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint!;
      const p256dh = subJson.keys!.p256dh!;
      const auth = subJson.keys!.auth!;

      // Upsert in DB
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: user.id,
            endpoint,
            keys_p256dh: p256dh,
            keys_auth: auth,
            device_info: navigator.userAgent.slice(0, 200),
          },
          { onConflict: 'user_id,endpoint' }
        );

      if (error) throw error;
      setState('subscribed');
      toast.success('Notifications activées sur cet appareil');
    } catch (err: any) {
      console.error('Push subscription failed:', err);
      toast.error('Échec abonnement : ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { state, subscribe, loading, isPreview: state === 'preview' };
}
