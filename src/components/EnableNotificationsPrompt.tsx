import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { requestOneSignalPermission, getOneSignalPermission } from '@/hooks/useOneSignal';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY_PREFIX = 'dlcrm_notif_prompt_seen_';

export function EnableNotificationsPrompt() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    const key = STORAGE_KEY_PREFIX + user.id;
    const alreadySeen = localStorage.getItem(key);
    if (alreadySeen) return;

    // Si déjà accordées ou refusées au niveau navigateur, ne pas redemander
    const perm = Notification.permission;
    if (perm === 'granted' || getOneSignalPermission()) {
      localStorage.setItem(key, '1');
      return;
    }
    if (perm === 'denied') {
      localStorage.setItem(key, '1');
      return;
    }

    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [user?.id]);

  const dismiss = () => {
    if (user?.id) localStorage.setItem(STORAGE_KEY_PREFIX + user.id, '1');
    setOpen(false);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const ok = await requestOneSignalPermission(user?.id);
      if (ok) {
        toast.success('Notifications activées');
      } else {
        toast.error('Permission refusée. Tu peux réessayer dans Paramètres → Notifications.');
      }
    } finally {
      setLoading(false);
      dismiss();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Active les notifications</DialogTitle>
          <DialogDescription className="text-center">
            Reçois une alerte instantanée pour chaque nouveau lead, message WhatsApp et rappel de tâche — même quand l'app est fermée.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleEnable} disabled={loading} className="w-full gap-2">
            <Bell className="h-4 w-4" />
            {loading ? 'Activation…' : 'Activer les notifications'}
          </Button>
          <Button variant="ghost" onClick={dismiss} disabled={loading} className="w-full gap-2">
            <BellOff className="h-4 w-4" />
            Plus tard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
