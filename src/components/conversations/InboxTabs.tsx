import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type InboxTab = 'all' | 'unread' | 'to_reply' | 'waiting' | 'snoozed' | 'resolved';

const TABS: { key: InboxTab; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'unread', label: 'Non lus' },
  { key: 'to_reply', label: 'À répondre' },
  { key: 'waiting', label: 'En attente' },
  { key: 'snoozed', label: 'Snooze' },
  { key: 'resolved', label: 'Résolus' },
];

export function InboxTabs({
  active,
  onChange,
  counts,
}: {
  active: InboxTab;
  onChange: (t: InboxTab) => void;
  counts: Partial<Record<InboxTab, number>>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {TABS.map((t) => {
        const n = counts[t.key];
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'shrink-0 text-[11px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1',
              isActive
                ? 'bg-primary/20 border-primary/60 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {typeof n === 'number' && n > 0 && (
              <Badge variant="outline" className="h-3.5 px-1 text-[9px] border-0 bg-foreground/10">{n}</Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
