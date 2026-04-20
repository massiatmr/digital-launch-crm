import { useUpdateLead } from '@/hooks/useLeadData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ShowStatus = 'pending' | 'show' | 'noshow';

const options: { value: ShowStatus; icon: string; label: string; className: string }[] = [
  { value: 'pending', icon: '⏳', label: 'En attente', className: 'bg-muted text-muted-foreground' },
  { value: 'show', icon: '✅', label: 'Présent', className: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'noshow', icon: '❌', label: 'Absent', className: 'bg-red-500/15 text-red-400' },
];

interface ShowStatusToggleProps {
  leadId: string;
  currentStatus: ShowStatus;
  size?: 'sm' | 'md';
  showHelper?: boolean;
}

export function ShowStatusToggle({ leadId, currentStatus, size = 'sm', showHelper = false }: ShowStatusToggleProps) {
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
    <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
      {showHelper && (
        <span className="text-[11px] text-muted-foreground">
          Ce prospect a-t-il assisté au rendez-vous ?
        </span>
      )}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 w-fit">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={(e) => handleClick(e, opt.value)}
            className={cn(
              'rounded-full transition-all flex items-center gap-1 font-medium',
              size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
              currentStatus === opt.value ? opt.className : 'text-muted-foreground/40 hover:text-muted-foreground/70'
            )}
            title={opt.label}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
