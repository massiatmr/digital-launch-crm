import { cn } from '@/lib/utils';
import { LeadScore } from '@/types/lead';

interface LeadScoreBadgeProps {
  score: LeadScore;
  className?: string;
}

const config: Record<LeadScore, { label: string; className: string }> = {
  hot: { label: '🔥 Chaud', className: 'bg-lead-hot/15 text-lead-hot border-lead-hot/30' },
  warm: { label: '🌤 Tiède', className: 'bg-lead-warm/15 text-lead-warm border-lead-warm/30' },
  cold: { label: '❄️ Froid', className: 'bg-lead-cold/15 text-lead-cold border-lead-cold/30' },
};

export function LeadScoreBadge({ score, className }: LeadScoreBadgeProps) {
  const c = config[score];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', c.className, className)}>
      {c.label}
    </span>
  );
}
