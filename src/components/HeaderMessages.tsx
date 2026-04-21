import { MessageCircle, Inbox } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { cn } from '@/lib/utils';

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return `${j} j`;
  return d.toLocaleDateString('fr-FR');
}

export function HeaderMessages() {
  const { isEnabled } = useWorkspaceFeatures();
  const { items, unreadCount, markSeen } = useWhatsAppInbox();
  const navigate = useNavigate();

  if (!isEnabled('conversations')) return null;

  const top = items.slice(0, 8);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-foreground hover:bg-primary/10">
          <MessageCircle className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <p className="text-sm font-semibold">Conversations WhatsApp</p>
          {unreadCount > 0 && <span className="text-xs text-muted-foreground">{unreadCount} non lue(s)</span>}
        </div>
        <ScrollArea className="max-h-80">
          {top.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Inbox className="h-8 w-8 opacity-50" />
              <p className="text-xs">Aucune conversation</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {top.map((c) => (
                <li
                  key={c.lead_id}
                  onClick={() => { markSeen(c.lead_id); navigate(`/conversations?lead=${c.lead_id}`); }}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 hover:bg-muted/30 transition cursor-pointer',
                    c.unread && 'bg-primary/5'
                  )}
                >
                  <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', c.unread ? 'bg-primary' : 'bg-transparent')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium truncate">{c.lead_name}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">{formatRelative(c.last_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {c.last_direction === 'outbound' ? 'Vous : ' : ''}{c.last_message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t border-border/50 px-3 py-2">
          <Link to="/conversations" className="text-xs text-primary hover:underline">
            Voir toutes les conversations →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
