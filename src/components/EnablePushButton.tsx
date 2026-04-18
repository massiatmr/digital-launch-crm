import { useEffect, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { requestOneSignalPermission, getOneSignalPermission } from '@/hooks/useOneSignal';

export function EnablePushButton() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setSupported(false);
      return;
    }
    setEnabled(getOneSignalPermission() || Notification.permission === 'granted');
    const t = setInterval(() => {
      setEnabled(getOneSignalPermission() || Notification.permission === 'granted');
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const handleClick = async () => {
    setLoading(true);
    try {
      const ok = await requestOneSignalPermission();
      if (ok) {
        setEnabled(true);
        toast.success('Notifications activées');
      } else {
        toast.error('Permission refusée ou bloquée');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <BellOff className="h-4 w-4" />
        Non supporté
      </Button>
    );
  }

  return (
    <Button
      variant={enabled ? 'outline' : 'default'}
      size="sm"
      disabled={enabled || loading}
      onClick={handleClick}
      className="gap-2"
    >
      {enabled ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {loading ? 'Activation…' : enabled ? 'Notifications activées' : 'Activer les notifications'}
    </Button>
  );
}
