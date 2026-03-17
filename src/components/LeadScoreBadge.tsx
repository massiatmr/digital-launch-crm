import { cn } from '@/lib/utils';
import { LeadScore } from '@/types/lead';

interface LeadScoreBadgeProps {
  score: LeadScore;
  className?: string;
}

const config: Record<LeadScore, { label: string; dot: string; bg: string; text: string }> = {
  hot: { label: 'Chaud', dot: 'bg-lead-hot', bg: 'bg-lead-hot/10', text: 'text-lead-hot' },
  warm: { label: 'Tiède', dot: 'bg-lead-warm', bg: 'bg-lead-warm/10', text: 'text-lead-warm' },
  cold: { label: 'Froid', dot: 'bg-lead-cold', bg: 'bg-lead-cold/10', text: 'text-lead-cold' },
};

export function LeadScoreBadge({ score, className }: LeadScoreBadgeProps) {
  const c = config[score];
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
      c.bg, c.text,
      className
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
}
