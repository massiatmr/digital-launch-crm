import { useEffect } from 'react';
import OneSignal from 'react-onesignal';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

const ONESIGNAL_APP_ID = '46f7498d-e02a-4ee9-bbc6-28f0ec0d7aea';
const SAFARI_WEB_ID = 'web.onesignal.auto.1b1338f0-ae7a-49c0-a5a1-0112be9b9bea';

let initPromise: Promise<void> | null = null;
let clickHandlerBound = false;

function isPreviewIframe() {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return false;
}

async function initOnce() {
  if (initPromise) return initPromise;
  if (isPreviewIframe()) return;

  initPromise = OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    safari_web_id: SAFARI_WEB_ID,
    allowLocalhostAsSecureOrigin: true,
    serviceWorkerPath: 'OneSignalSDKWorker.js',
  } as any).catch((e: unknown) => {
    console.error('OneSignal init error', e);
    initPromise = null;
  });

  return initPromise;
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

      // Bind click handler once → SPA navigation instead of full reload
      if (!clickHandlerBound) {
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
          clickHandlerBound = true;
        } catch (e) {
          console.warn('OneSignal click handler bind failed', e);
        }
      }

      if (!user) return;
      try {
        await OneSignal.login(user.id);
      } catch (e) {
        console.error('OneSignal login error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, navigate]);

  useEffect(() => {
    if (isPreviewIframe()) return;
    if (!user) {
      OneSignal.logout?.().catch(() => {});
    }
  }, [user]);
}

export async function requestOneSignalPermission(): Promise<boolean> {
  if (isPreviewIframe()) return false;
  await initOnce();
  try {
    await OneSignal.Notifications.requestPermission();
    return OneSignal.Notifications.permission === true;
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
