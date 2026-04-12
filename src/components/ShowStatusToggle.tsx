import { useUpdateLead } from '@/hooks/useLeadData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ShowStatus = 'pending' | 'show' | 'noshow';

const options: { value: ShowStatus; label: string; className: string }[] = [
  { value: 'pending', label: '⏳', className: 'bg-muted text-muted-foreground' },
  { value: 'show', label: '✅', className: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'noshow', label: '❌', className: 'bg-red-500/15 text-red-400' },
];

interface ShowStatusToggleProps {
  leadId: string;
  currentStatus: ShowStatus;
  size?: 'sm' | 'md';
}

export function ShowStatusToggle({ leadId, currentStatus, size = 'sm' }: ShowStatusToggleProps) {
  const updateLead = useUpdateLead();

  const handleClick = (e: React.MouseEvent, newStatus: ShowStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (newStatus === currentStatus) return;
    updateLead.mutate(
      { id: leadId, show_status: newStatus } as any,
      {
        onSuccess: () => toast.success(`Présence mise à jour`),
        onError: () => toast.error('Erreur lors de la mise à jour'),
      }
    );
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5" onClick={e => e.stopPropagation()}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={(e) => handleClick(e, opt.value)}
          className={cn(
            'rounded-full transition-all',
            size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
            currentStatus === opt.value ? opt.className : 'text-muted-foreground/40 hover:text-muted-foreground/70'
          )}
          title={opt.value === 'pending' ? 'En attente' : opt.value === 'show' ? 'Présent' : 'Absent'}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
