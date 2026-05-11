import { useAiStatus, aiStatusLabel, aiReasonLabel } from '@/hooks/useAiStatus';
import { Bot, AlertTriangle, Pause, Moon, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export function AiStatusBanner({ leadId }: { leadId: string }) {
  const { data, isLoading } = useAiStatus(leadId);
  if (isLoading || !data) return null;
  const { label, tone } = aiStatusLabel(data);
  const reason = aiReasonLabel(data.reason);

  const toneCls =
    tone === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
    : tone === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
    : tone === 'danger' ? 'bg-red-500/10 border-red-500/30 text-red-300'
    : 'bg-white/5 border-white/10 text-muted-foreground';

  const Icon =
    data.status === 'active' ? Bot
    : data.status === 'paused' ? Pause
    : data.status === 'snoozed' ? Moon
    : data.status === 'resolved' ? CheckCircle2
    : data.status === 'idle_no_task' ? Clock
    : AlertTriangle;

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', toneCls)}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{label}</div>
        {reason && <div className="opacity-80">{reason}</div>}
        {data.next_task && (
          <div className="opacity-70 mt-0.5">
            Prochaine relance ({data.next_task.task_type}) {formatDistanceToNow(new Date(data.next_task.scheduled_at), { addSuffix: true, locale: fr })}
          </div>
        )}
      </div>
    </div>
  );
}
