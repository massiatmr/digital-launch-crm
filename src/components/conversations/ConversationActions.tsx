import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Lock, LockOpen, Clock, CheckCircle2, Tag, MoreVertical, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  useConvControls, useTogglePauseAutomation, useSnoozeConv, useResolveConv,
} from '@/hooks/useConversationControls';
import { useConvLabels, useLeadLabels, useToggleLabel } from '@/hooks/useConversationLabels';
import { addHours, addDays, setHours, setMinutes, nextMonday } from 'date-fns';

export function ConversationActions({ leadId }: { leadId: string }) {
  const { data: ctl } = useConvControls(leadId);
  const togglePause = useTogglePauseAutomation();
  const snooze = useSnoozeConv();
  const resolve = useResolveConv();
  const [labelOpen, setLabelOpen] = useState(false);
  const { data: labels = [] } = useConvLabels();
  const { data: assigned = [] } = useLeadLabels(leadId);
  const toggleLabel = useToggleLabel();

  const paused = !!ctl?.automation_paused_at;
  const snoozed = ctl?.snoozed_until && new Date(ctl.snoozed_until).getTime() > Date.now();
  const resolved = !!ctl?.resolved_at;

  const snoozeOptions = [
    { label: '1 heure', value: () => addHours(new Date(), 1) },
    { label: '4 heures', value: () => addHours(new Date(), 4) },
    { label: 'Demain matin (9h)', value: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'Lundi 9h', value: () => setMinutes(setHours(nextMonday(new Date()), 9), 0) },
  ];

  return (
    <div className="flex items-center gap-1">
      {/* Pause toggle */}
      <Button
        size="sm"
        variant={paused ? 'default' : 'ghost'}
        className="h-7 px-2 text-xs gap-1"
        onClick={() => togglePause.mutate({ leadId, paused: !paused })}
        title={paused ? 'Réactiver l\'automation' : 'Pause automation pour ce lead'}
      >
        {paused ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        <span className="hidden sm:inline">{paused ? 'Auto en pause' : 'Pause auto'}</span>
      </Button>

      {/* Labels */}
      <DropdownMenu open={labelOpen} onOpenChange={setLabelOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Labels">
            <Tag className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs">Étiquettes</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {labels.length === 0 && (
            <DropdownMenuItem disabled className="text-xs">Aucun label</DropdownMenuItem>
          )}
          {labels.map((l) => {
            const on = assigned.includes(l.id);
            return (
              <DropdownMenuItem
                key={l.id}
                onSelect={(e) => { e.preventDefault(); toggleLabel.mutate({ leadId, labelId: l.id, on: !on }); }}
                className="gap-2 text-xs"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                <span className="flex-1">{l.name}</span>
                {on && <CheckCircle2 className="h-3 w-3 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Plus actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs">⏰ Snooze</DropdownMenuLabel>
          {snoozeOptions.map((o) => (
            <DropdownMenuItem
              key={o.label}
              onClick={() => snooze.mutate({ leadId, until: o.value().toISOString() })}
              className="text-xs"
            >
              {o.label}
            </DropdownMenuItem>
          ))}
          {snoozed && (
            <DropdownMenuItem
              onClick={() => snooze.mutate({ leadId, until: null })}
              className="text-xs text-amber-500"
            >
              Retirer le snooze
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              if (!confirm('Relancer cette conversation avec Lia ? Elle va analyser et répondre maintenant.')) return;
              const { error } = await supabase.functions.invoke('qualify-conversation', { body: { lead_id: leadId, relaunch: true } });
              if (error) toast.error("Impossible de relancer Lia");
              else toast.success('Lia relance la conversation');
            }}
            className="text-xs gap-2"
          >
            <Sparkles className="h-3 w-3" />
            Relancer avec Lia
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => resolve.mutate({ leadId, resolved: !resolved })}
            className="text-xs gap-2"
          >
            <CheckCircle2 className="h-3 w-3" />
            {resolved ? 'Réouvrir la conv' : 'Marquer résolu'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
