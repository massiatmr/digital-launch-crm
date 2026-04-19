import { useEffect } from 'react';
import OneSignal from 'react-onesignal';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const ONESIGNAL_APP_ID = '46f7498d-e02a-4ee9-bbc6-28f0ec0d7aea';
const SAFARI_WEB_ID = 'web.onesignal.auto.1b1338f0-ae7a-49c0-a5a1-0112be9b9bea';
const DEVICE_ID_KEY = 'dlcrm_device_id';

declare global {
  interface Window {
    __onesignal_initialized?: boolean;
    __onesignal_click_bound?: boolean;
    __onesignal_sub_listener_bound?: boolean;
    __onesignal_init_promise?: Promise<void>;
    __onesignal_active_user_id?: string | null;
  }
}

function isPreviewIframe() {
  try {
    if (typeof window === 'undefined') return true;
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return false;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

async function persistOneSignalSubscription(userId: string, subscriptionId: string) {
  if (!subscriptionId) return false;

  const ua = navigator.userAgent || '';
  const platform = detectPlatform(ua);
  const browser = detectBrowser(ua);
  const standalone = isStandalonePWA();
  const deviceId = getOrCreateDeviceId();
  const label = `${platform} · ${browser}${standalone ? ' (PWA)' : ''}`;

  const payload = {
    user_id: userId,
    endpoint: `onesignal:${subscriptionId}`,
    keys_p256dh: 'onesignal',
    keys_auth: 'onesignal',
    device_info: ua.slice(0, 200),
    device_id: deviceId,
    device_label: label,
    platform,
    browser,
    is_standalone: standalone,
    last_seen_at: new Date().toISOString(),
    status: 'active',
    last_success_at: new Date().toISOString(),
    last_error: null,
  } as any;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });

  if (error) {
    console.error('OneSignal subscription sync error', error);
    return false;
  }

  return true;
}

function ensureSubscriptionListener() {
  if (typeof window === 'undefined') return;
  if (window.__onesignal_sub_listener_bound) return;
  try {
    (OneSignal as any).User?.PushSubscription?.addEventListener?.('change', async (event: any) => {
      const subscriptionId = event?.current?.id;
      const userId = window.__onesignal_active_user_id;
      if (!userId || !subscriptionId) return;
      await persistOneSignalSubscription(userId, subscriptionId);
    });
    window.__onesignal_sub_listener_bound = true;
  } catch (e) {
    console.warn('OneSignal subscription listener bind failed', e);
  }
}

async function initOnce(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isPreviewIframe()) return;
  if (window.__onesignal_init_promise) return window.__onesignal_init_promise;
  if (window.__onesignal_initialized) return;

  window.__onesignal_initialized = true;

  window.__onesignal_init_promise = OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    safari_web_id: SAFARI_WEB_ID,
    allowLocalhostAsSecureOrigin: true,
    serviceWorkerPath: 'OneSignalSDKWorker.js',
    serviceWorkerUpdaterPath: 'OneSignalSDKUpdaterWorker.js',
    serviceWorkerParam: { scope: '/' },
    notifyButton: { enable: false },
    autoResubscribe: true,
  } as any).catch((e: unknown) => {
    console.error('OneSignal init error', e);
    // Allow retry if init really failed (network etc.)
    window.__onesignal_initialized = false;
    window.__onesignal_init_promise = undefined;
  });

  return window.__onesignal_init_promise;
}

function getCurrentExternalId(): string | null {
  try {
    return ((OneSignal as any)?.User?.externalId as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function ensureOneSignalLinked(userId?: string | null): Promise<boolean> {
  if (isPreviewIframe() || !userId) return false;

  window.__onesignal_active_user_id = userId;
  await initOnce();
  ensureSubscriptionListener();

  // Only call login if not already linked to this user — avoids LoginManager churn
  try {
    const currentExternalId = getCurrentExternalId();
    if (currentExternalId !== userId) {
      await OneSignal.login(userId);
    }
  } catch (e) {
    console.error('OneSignal login error', e);
  }

  for (let i = 0; i < 12; i++) {
    try {
      const permissionGranted = OneSignal.Notifications?.permission === true;
      const subscriptionId = (OneSignal as any)?.User?.PushSubscription?.id as string | null;
      const optedIn = Boolean((OneSignal as any)?.User?.PushSubscription?.optedIn);

      if (permissionGranted && subscriptionId) {
        await persistOneSignalSubscription(userId, subscriptionId);
        if (optedIn || i >= 2) return true;
      }
    } catch {
      // ignore transient SDK state
    }
    await wait(500);
  }

  return false;
}

export function useOneSignal() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPreviewIframe()) return;
    let cancelled = false;
    (async () => {
      await initOnce();
      if (cancelled) return;

      if (!window.__onesignal_click_bound) {
        try {
          OneSignal.Notifications.addEventListener('click', (event: any) => {
            const url: string | undefined = event?.notification?.launchURL || event?.notification?.url;
            if (!url) return;
            try {
              const u = new URL(url, window.location.origin);
              if (u.origin === window.location.origin) {
                navigate(u.pathname + u.search + u.hash);
                window.focus();
                return;
              }
            } catch {
              // ignore
            }
            window.location.href = url;
          });
          window.__onesignal_click_bound = true;
        } catch (e) {
          console.warn('OneSignal click handler bind failed', e);
        }
      }

      ensureSubscriptionListener();

      if (!user) return;
      await ensureOneSignalLinked(user.id);
    })();

    return () => {
      cancelled = true;
    };
    // NOTE: intentionally NOT depending on `user` to avoid re-init/logout churn.
    // Linking on user change is handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Re-link when user changes — but NEVER call OneSignal.logout() automatically.
  // Auto-logout was causing LoginManager errors and lost subscriptions.
  useEffect(() => {
    if (isPreviewIframe()) return;
    if (!user) {
      window.__onesignal_active_user_id = null;
      return;
    }
    ensureOneSignalLinked(user.id).catch(() => {});
  }, [user?.id]);
}

export async function requestOneSignalPermission(userId?: string | null): Promise<boolean> {
  if (isPreviewIframe()) return false;
  await initOnce();
  ensureSubscriptionListener();

  try {
    if (userId) {
      window.__onesignal_active_user_id = userId;
      const currentExternalId = getCurrentExternalId();
      if (currentExternalId !== userId) {
        await OneSignal.login(userId);
      }
    }

    await OneSignal.Notifications.requestPermission();
    const granted = OneSignal.Notifications.permission === true;
    if (!granted) return false;

    return await ensureOneSignalLinked(userId ?? window.__onesignal_active_user_id ?? null);
  } catch (e) {
    console.error('OneSignal permission error', e);
    return false;
  }
}

export function getOneSignalPermission(): boolean {
  try {
    return OneSignal.Notifications?.permission === true;
  } catch {
    return false;
  }
}

/**
 * Explicit logout — call ONLY when the user manually switches accounts.
 * Never wire this to React lifecycle, auth listeners, or unmount.
 */
export async function explicitOneSignalLogout(): Promise<void> {
  try {
    window.__onesignal_active_user_id = null;
    await OneSignal.logout?.();
  } catch (e) {
    console.warn('OneSignal explicit logout error', e);
  }
}
