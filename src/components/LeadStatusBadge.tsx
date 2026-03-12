import { cn } from '@/lib/utils';
import { LeadStatus } from '@/types/lead';

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'Nouveau', className: 'bg-primary/15 text-primary' },
  contacted: { label: 'Contacté', className: 'bg-lead-warm/15 text-lead-warm' },
  qualified: { label: 'Qualifié', className: 'bg-lead-hot/15 text-lead-hot' },
  proposal: { label: 'Proposition', className: 'bg-purple-500/15 text-purple-400' },
  won: { label: 'Gagné', className: 'bg-lead-hot/15 text-lead-hot' },
  lost: { label: 'Perdu', className: 'bg-destructive/15 text-destructive' },
};

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const c = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', c.className, className)}>
      {c.label}
    </span>
  );
}
