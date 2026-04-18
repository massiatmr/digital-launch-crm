import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

let CACHED_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const DEVICE_ID_KEY = 'dlcrm_device_id';

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
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
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

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function detectPlatform(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/macintosh/i.test(ua)) return 'macOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Web';
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'Safari';
  if (/firefox\//i.test(ua)) return 'Firefox';
  return 'Other';
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  // @ts-ignore iOS
  if (window.navigator.standalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export type PushState = 'unsupported' | 'preview' | 'default' | 'denied' | 'granted' | 'subscribed';

async function upsertSubscriptionRow(args: {
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
}) {
  const ua = navigator.userAgent || '';
  const deviceId = getOrCreateDeviceId();
  const platform = detectPlatform(ua);
  const browser = detectBrowser(ua);
  const standalone = isStandalonePWA();
  const label = `${platform} · ${browser}${standalone ? ' (PWA)' : ''}`;

  const payload = {
    user_id: args.userId,
    endpoint: args.endpoint,
    keys_p256dh: args.p256dh,
    keys_auth: args.authKey,
    device_info: ua.slice(0, 200),
    device_id: deviceId,
    device_label: label,
    platform,
    browser,
    is_standalone: standalone,
    last_seen_at: new Date().toISOString(),
    status: 'active',
  } as any;

  // Use endpoint conflict (unique index) to merge existing rows reliably.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });
  if (error) throw error;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('unsupported');
  const [loading, setLoading] = useState(false);
  const heartbeatRef = useRef<number | null>(null);

  // Detect support / preview / permission
  useEffect(() => {
    const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !hasNotification) {
      setState('unsupported');
      return;
    }
    if (isPreviewEnvironment()) {
      setState('preview');
      return;
    }
    const perm = window.Notification.permission;
    if (perm === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : perm === 'granted' ? 'granted' : 'default');
      });
    }).catch(err => console.error('SW ready failed:', err));
  }, []);

  // Auto-sync existing subscription + heartbeat (last_seen_at) when user logs in.
  useEffect(() => {
    if (!user) return;
    if (state === 'unsupported' || state === 'preview' || state === 'denied') return;

    let cancelled = false;
    const sync = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/service-worker.js')
          ?? await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || cancelled) return;
        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
        await upsertSubscriptionRow({
          userId: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          authKey: json.keys.auth,
        });
      } catch (err) {
        console.warn('Push subscription sync failed:', err);
      }
    };

    sync();
    // Heartbeat every 5 min while page is open
    heartbeatRef.current = window.setInterval(sync, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [user?.id, state]);

  const subscribe = useCallback(async () => {
    if (!user) {
      toast.error('Tu dois être connecté');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error("Ton navigateur ne supporte pas les notifications push. Sur iPhone : ajoute le site à l'écran d'accueil puis ouvre-le depuis l'icône.");
      setState('unsupported');
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
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        toast.error('Permission refusée pour les notifications');
        return;
      }
      setState('granted');

      let registration = await navigator.serviceWorker.getRegistration('/service-worker.js');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/service-worker.js');
      }
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try {
          const currentKey = subscription.options?.applicationServerKey;
          const expectedKey = urlBase64ToUint8Array(vapidKey).buffer;
          const matches = currentKey && new Uint8Array(currentKey as ArrayBuffer).every(
            (b, i) => b === new Uint8Array(expectedKey)[i]
          );
          if (!matches) {
            await subscription.unsubscribe();
            subscription = null;
          }
        } catch {
          await subscription.unsubscribe();
          subscription = null;
        }
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
      }

      const subJson = subscription.toJSON();
      await upsertSubscriptionRow({
        userId: user.id,
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh!,
        authKey: subJson.keys!.auth!,
      });

      setState('subscribed');
      toast.success('Notifications activées sur cet appareil');
    } catch (err: any) {
      console.error('Push subscription failed:', err);
      toast.error('Échec abonnement : ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  return {
    state,
    subscribe,
    loading,
    isPreview: state === 'preview',
    deviceId: typeof window !== 'undefined' ? getOrCreateDeviceId() : '',
  };
}
