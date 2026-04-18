import { useEffect, useState } from 'react';
import { Smartphone, Share, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'pwa-guide-dismissed';

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  if (typeof window === 'undefined') return false;
  // @ts-ignore - iOS Safari
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export function PwaInstallGuide() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 relative">
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setShow(false); }}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Smartphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">Recevoir les notifications même app fermée</p>
          {isIos() ? (
            <>
              <p className="text-muted-foreground">
                Sur iPhone, les notifications push ne fonctionnent que si l'app est installée sur l'écran d'accueil.
              </p>
              <ol className="text-xs text-muted-foreground space-y-1 ml-1">
                <li>1. Ouvre cette page dans Safari</li>
                <li>2. Appuie sur <Share className="inline h-3 w-3 mx-1" /> Partager</li>
                <li>3. <Plus className="inline h-3 w-3 mx-1" /> Sur l'écran d'accueil</li>
                <li>4. Lance l'app depuis l'icône, puis active les notifications</li>
              </ol>
            </>
          ) : (
            <p className="text-muted-foreground">
              Installe l'app sur ton appareil (Menu navigateur → "Installer l'application") pour recevoir les notifications même quand l'app est fermée.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
