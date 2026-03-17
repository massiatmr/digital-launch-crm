import { MoreVertical, MessageSquare, Phone as PhoneIcon, Zap, Flame, Snowflake, ThermometerSun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { DbLead, useUpdateLead } from '@/hooks/useLeadData';
import { toast } from 'sonner';
import { toWhatsAppUrl } from '@/lib/phone';
import { LeadScore } from '@/types/lead';

interface QuickActionsMenuProps {
  lead: DbLead;
  onPrepareCall?: (lead: DbLead) => void;
  onWarmUp?: (lead: DbLead) => void;
}

export function QuickActionsMenu({ lead, onPrepareCall, onWarmUp }: QuickActionsMenuProps) {
  const updateLead = useUpdateLead();

  const handleScoreChange = (score: LeadScore) => {
    updateLead.mutate(
      { id: lead.id, score },
      { onSuccess: () => toast.success(`Score de ${lead.name} → ${score}`) }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted/50 hover:text-foreground transition-all"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        {lead.phone && (
          <DropdownMenuItem asChild>
            <a href={toWhatsAppUrl(lead.phone)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
              WhatsApp
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onPrepareCall?.(lead)} className="flex items-center gap-2">
          <PhoneIcon className="h-3.5 w-3.5 text-primary" />
          Préparer l'appel
        </DropdownMenuItem>
        {lead.score === 'cold' && (
          <DropdownMenuItem onClick={() => onWarmUp?.(lead)} className="flex items-center gap-2">
            <ThermometerSun className="h-3.5 w-3.5 text-lead-warm" />
            Réchauffer le lead
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">Changer le score</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleScoreChange('hot')} className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-lead-hot" />
          Chaud
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleScoreChange('warm')} className="flex items-center gap-2">
          <ThermometerSun className="h-3.5 w-3.5 text-lead-warm" />
          Tiède
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleScoreChange('cold')} className="flex items-center gap-2">
          <Snowflake className="h-3.5 w-3.5 text-lead-cold" />
          Froid
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
