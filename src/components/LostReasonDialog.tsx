import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const QUICK_REASONS = [
  'Trop cher',
  'Pas le bon timing',
  'A choisi un concurrent',
  'Ne répond plus',
  'Pas convaincu',
  'Besoin pas clair',
];

interface LostReasonDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function LostReasonDialog({ open, onConfirm, onCancel }: LostReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const handleQuickSelect = (r: string) => {
    if (selected === r) {
      setSelected(null);
      setReason('');
    } else {
      setSelected(r);
      setReason(r);
    }
  };

  const handleConfirm = () => {
    onConfirm(reason.trim() || 'Non précisée');
    setReason('');
    setSelected(null);
  };

  const handleCancel = () => {
    setReason('');
    setSelected(null);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pourquoi ce lead est perdu ?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => handleQuickSelect(r)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  selected === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Ou tapez votre propre raison…"
            value={reason}
            onChange={e => { setReason(e.target.value); setSelected(null); }}
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Annuler</Button>
          <Button onClick={handleConfirm}>Confirmer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
