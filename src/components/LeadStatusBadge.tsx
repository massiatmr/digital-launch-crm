import { cn } from '@/lib/utils';
import { LeadStatus } from '@/types/lead';

const statusConfig: Record<LeadStatus, { label: string; bg: string; text: string }> = {
  new: { label: 'Nouveau', bg: 'bg-primary/10', text: 'text-primary' },
  contacted: { label: 'Contacté', bg: 'bg-lead-warm/10', text: 'text-lead-warm' },
  qualified: { label: 'Qualifié', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  proposal: { label: 'Proposition', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  won: { label: 'Gagné', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  lost: { label: 'Perdu', bg: 'bg-destructive/10', text: 'text-destructive' },
  ghost: { label: 'À Relancer', bg: 'bg-lead-warm/10', text: 'text-lead-warm' },
};

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const c = statusConfig[status];
  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
      c.bg, c.text,
      className
    )}>
      {c.label}
    </span>
  );
}
