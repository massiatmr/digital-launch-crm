import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return d.toLocaleDateString('fr-FR');
}

export function HeaderNotifications() {
  const { items, unreadCount, markAllSeen } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-foreground hover:bg-primary/10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <p className="text-sm font-semibold">Notifications</p>
          {items.length > 0 && unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllSeen} className="h-7 gap-1 text-xs">
              <CheckCheck className="h-3.5 w-3.5" />
              Tout marquer lu
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Inbox className="h-8 w-8 opacity-50" />
              <p className="text-xs">Aucune notification</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 hover:bg-muted/30 transition',
                    n.unread && 'bg-primary/5'
                  )}
                >
                  <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-primary' : 'bg-transparent')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatRelative(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t border-border/50 px-3 py-2">
          <Link to="/settings/notifications" className="text-xs text-primary hover:underline">
            Gérer les notifications →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
