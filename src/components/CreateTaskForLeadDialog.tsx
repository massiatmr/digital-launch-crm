import { useState } from 'react';
import { addDays, setHours, setMinutes } from 'date-fns';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateReminder } from '@/hooks/useLeadData';
import { DateTimePicker } from '@/components/DateTimePicker';

interface Props {
  leadId: string;
  leadName?: string;
  trigger?: React.ReactNode;
  defaultAction?: string;
}

const QUICK_ACTIONS = [
  'Rappeler le lead',
  'Envoyer un message WhatsApp',
  'Envoyer email de suivi',
  'Préparer le RDV',
  'Relancer après proposition',
];

export function CreateTaskForLeadDialog({ leadId, leadName, trigger, defaultAction = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(defaultAction);
  const [date, setDate] = useState<Date>(() => setMinutes(setHours(addDays(new Date(), 1), 9), 0));
  const createReminder = useCreateReminder();

  const reset = () => {
    setAction(defaultAction);
    setDate(setMinutes(setHours(addDays(new Date(), 1), 9), 0));
  };

  const handleSubmit = async () => {
    if (!action.trim()) return;
    await createReminder.mutateAsync({ lead_id: leadId, action: action.trim(), due_date: date.toISOString() });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nouvelle tâche
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche{leadName ? ` — ${leadName}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Action à faire</Label>
            <Input
              autoFocus
              placeholder="Ex: Rappeler pour confirmer le RDV"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground hover:bg-accent transition-colors"
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quand ?</Label>
            <DateTimePicker value={date} onChange={setDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!action.trim() || createReminder.isPending}>
            {createReminder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Créer la tâche
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
