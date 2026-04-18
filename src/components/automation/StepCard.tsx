import { Clock, MessageSquare, Sparkles, AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WhatsAppTemplate } from '@/hooks/useWhatsAppTemplates';

export interface StepConfig {
  key: 'template_initial_id' | 'template_followup_1_id' | 'template_followup_2_id' | 'template_last_followup_id';
  delayKey: 'initial_delay_minutes' | 'followup_1_delay_hours' | 'followup_2_delay_hours' | 'last_followup_delay_hours';
  delayUnit: 'min' | 'h';
  label: string;
  icon: typeof MessageSquare;
  description: string;
}

export const STEPS: StepConfig[] = [
  { key: 'template_initial_id', delayKey: 'initial_delay_minutes', delayUnit: 'min', label: 'Message initial', icon: MessageSquare, description: 'Premier contact dès création du lead' },
  { key: 'template_followup_1_id', delayKey: 'followup_1_delay_hours', delayUnit: 'h', label: 'Relance 1', icon: Clock, description: 'Si pas de réponse au message initial' },
  { key: 'template_followup_2_id', delayKey: 'followup_2_delay_hours', delayUnit: 'h', label: 'Relance 2', icon: Clock, description: 'Deuxième tentative de réengagement' },
  { key: 'template_last_followup_id', delayKey: 'last_followup_delay_hours', delayUnit: 'h', label: 'Dernière relance', icon: Sparkles, description: 'Ultime message avant abandon' },
];

interface Props {
  step: StepConfig;
  index: number;
  template: WhatsAppTemplate | null;
  delay: number;
  isLast: boolean;
  dryRun: boolean;
  onClick: () => void;
}

export function StepCard({ step, index, template, delay, isLast, dryRun, onClick }: Props) {
  const Icon = step.icon;
  const hasTemplate = !!template;
  const willFailLive = !dryRun && !hasTemplate;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left rounded-xl border bg-card p-4 transition-all',
          'hover:border-primary/50 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]',
          willFailLive ? 'border-red-500/40' : 'border-border',
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'shrink-0 h-10 w-10 rounded-lg flex items-center justify-center',
            hasTemplate ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">
                {index === 0 ? `T+${delay} ${step.delayUnit}` : `+${delay} ${step.delayUnit}`}
              </span>
              <span className="font-medium text-sm">{step.label}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {hasTemplate ? (
                <>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">
                    {template.name}
                  </span>
                  {template.variables_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {template.variables_count} var. IA
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  IA texte libre (hors fenêtre 24h = bloqué par Meta)
                </span>
              )}
            </div>

            {willFailLive && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Sans template, ce message ne partira pas en mode live
              </div>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      </button>

      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="h-6 w-px bg-border" />
          <span className="text-[10px] text-muted-foreground py-0.5">si pas de réponse</span>
          <div className="h-2 w-px bg-border" />
        </div>
      )}
    </div>
  );
}
