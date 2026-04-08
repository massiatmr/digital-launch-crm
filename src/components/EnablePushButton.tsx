import { Bell, BellOff, BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications, PushState } from '@/hooks/usePushNotifications';

const labels: Record<PushState, string> = {
  unsupported: 'Non supporté',
  default: 'Activer les rappels',
  denied: 'Notifications bloquées',
  granted: 'Activer les rappels',
  subscribed: 'Rappels activés',
};

const icons: Record<PushState, React.ReactNode> = {
  unsupported: <BellOff className="h-4 w-4" />,
  default: <Bell className="h-4 w-4" />,
  denied: <BellOff className="h-4 w-4" />,
  granted: <BellRing className="h-4 w-4" />,
  subscribed: <Check className="h-4 w-4" />,
};

export function EnablePushButton() {
  const { state, subscribe, loading } = usePushNotifications();

  const disabled = state === 'unsupported' || state === 'denied' || state === 'subscribed' || loading;

  return (
    <Button
      variant={state === 'subscribed' ? 'outline' : 'default'}
      size="sm"
      disabled={disabled}
      onClick={subscribe}
      className="gap-2"
    >
      {icons[state]}
      {loading ? 'Activation…' : labels[state]}
    </Button>
  );
}
