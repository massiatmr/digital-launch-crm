import { useState } from 'react';
import { useSequenceSteps, useUpsertSequenceStep, useDeleteSequenceStep, useReorderSequenceSteps, type SequenceStep } from '@/hooks/useSequenceSteps';
import { useActiveWorkspaceTemplates } from '@/hooks/useWhatsAppTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, MessageSquare, Phone, Calendar, RefreshCw, AlertTriangle, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const TASK_TYPES: { value: string; label: string; icon: any; needsTemplate: boolean }[] = [
  { value: 'initial_message', label: 'Message initial', icon: MessageSquare, needsTemplate: true },
  { value: 'followup_1', label: 'Relance', icon: MessageSquare, needsTemplate: true },
  { value: 'followup_2', label: 'Relance (2e)', icon: MessageSquare, needsTemplate: true },
  { value: 'last_followup', label: 'Dernière relance', icon: MessageSquare, needsTemplate: true },
  { value: 'reactivation', label: 'Réactivation (silence)', icon: RefreshCw, needsTemplate: true },
  { value: 'qualification', label: 'Qualification IA', icon: MessageSquare, needsTemplate: false },
  { value: 'propose_meeting', label: 'Proposer un RDV', icon: Calendar, needsTemplate: false },
  { value: 'manual_call', label: 'Appel manuel (escalade)', icon: Phone, needsTemplate: false },
];

export function SequenceEditor({ offerId = null }: { offerId?: string | null }) {
  const { data: steps = [], isLoading } = useSequenceSteps(offerId);
  const { data: templates = [] } = useActiveWorkspaceTemplates();
  const upsert = useUpsertSequenceStep();
  const del = useDeleteSequenceStep();
  const reorder = useReorderSequenceSteps();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[target];
    reorder.mutate([
      { id: a.id, step_order: b.step_order },
      { id: b.id, step_order: a.step_order },
    ]);
  };

  const addStep = () => {
    const nextOrder = (sorted[sorted.length - 1]?.step_order || 0) + 1;
    upsert.mutate({
      step_order: nextOrder,
      task_type: 'followup_1',
      delay_value: 24,
      delay_unit: 'hours',
      template_id: null,
      label: `Étape ${nextOrder}`,
      is_enabled: true,
      offer_id: offerId,
    });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base">Étapes de la séquence</h2>
          <p className="text-xs text-muted-foreground">Glisse l'ordre, choisis le délai et le template de chaque relance.</p>
        </div>
        <Button size="sm" onClick={addStep} disabled={upsert.isPending} className="gap-1.5">
          <Plus className="h-4 w-4" /> Ajouter une étape
        </Button>
      </div>

      {sorted.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucune étape. Clique "Ajouter une étape" pour commencer.
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((step, idx) => (
          <StepRow
            key={step.id}
            step={step}
            index={idx}
            total={sorted.length}
            templates={templates}
            onUpdate={(patch) => upsert.mutate({ id: step.id, ...patch })}
            onDelete={() => setConfirmDel(step.id)}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
            isFirst={idx === 0}
          />
        ))}
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-destructive/40 rounded-xl p-5 max-w-sm space-y-3">
            <p className="text-sm">Supprimer cette étape ? Les leads existants ne sont pas affectés.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmDel(null)}>Annuler</Button>
              <Button variant="destructive" size="sm" onClick={() => { del.mutate(confirmDel); setConfirmDel(null); }}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow({
  step, index, total, templates, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  templates: any[];
  onUpdate: (patch: Partial<SequenceStep>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
}) {
  const taskMeta = TASK_TYPES.find((t) => t.value === step.task_type) || TASK_TYPES[1];
  const Icon = taskMeta.icon;
  const tpl = templates.find((t) => t.id === step.template_id);
  const needsTemplate = taskMeta.needsTemplate;
  const missingTemplate = needsTemplate && !step.template_id;

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-colors',
      step.is_enabled ? 'border-border' : 'border-border/50 opacity-60',
      missingTemplate && 'border-yellow-500/40'
    )}>
      <div className="flex items-start gap-3">
        {/* Drag handle + reorder */}
        <div className="flex flex-col gap-0.5 pt-1">
          <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-mono text-center text-muted-foreground">{index + 1}</span>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 space-y-3">
          {/* Header: label + toggle */}
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <Input
              value={step.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="h-8 font-medium border-transparent hover:border-border focus:border-border bg-transparent"
              placeholder="Nom de l'étape"
            />
            <Switch
              checked={step.is_enabled}
              onCheckedChange={(v) => onUpdate({ is_enabled: v })}
            />
            <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Type + delay grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={step.task_type} onValueChange={(v) => onUpdate({ task_type: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Délai après l'étape précédente</Label>
              <div className="flex gap-1 mt-1">
                <Input
                  type="number"
                  min={0}
                  value={step.delay_value}
                  onChange={(e) => onUpdate({ delay_value: parseInt(e.target.value) || 0 })}
                  className="h-9 w-20"
                />
                <Select value={step.delay_unit} onValueChange={(v) => onUpdate({ delay_unit: v as any })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">heures</SelectItem>
                    <SelectItem value="days">jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Template WhatsApp {!needsTemplate && <span className="text-muted-foreground/60">(optionnel)</span>}
              </Label>
              <Select
                value={step.template_id ?? 'none'}
                onValueChange={(v) => onUpdate({ template_id: v === 'none' ? null : v })}
              >
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun (IA texte libre)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {missingTemplate && (
            <p className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Sans template, l'envoi ne marchera que si le lead a répondu dans les 24h.
            </p>
          )}
          {tpl && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              📄 {tpl.body_text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
