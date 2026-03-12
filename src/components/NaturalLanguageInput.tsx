import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface NaturalLanguageInputProps {
  leadId: string;
  onUpdate?: (note: string) => void;
}

export function NaturalLanguageInput({ leadId, onUpdate }: NaturalLanguageInputProps) {
  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setIsProcessing(true);

    // Mock AI processing
    setTimeout(() => {
      setIsProcessing(false);

      // Simulated AI interpretation
      const lower = note.toLowerCase();
      const updates: string[] = [];

      if (lower.includes('appel') || lower.includes('appelé')) updates.push('Statut → Contacté');
      if (lower.includes('intéressé')) updates.push('Score → Chaud');
      if (lower.includes('pas intéressé') || lower.includes('refus')) updates.push('Score → Froid');
      if (lower.includes('rappel') || lower.includes('relancer')) updates.push('Rappel planifié');
      if (lower.includes('proposition') || lower.includes('devis')) updates.push('Statut → Proposition');
      if (lower.includes('gagné') || lower.includes('signé')) updates.push('Statut → Gagné 🎉');

      if (updates.length > 0) {
        toast.success(
          <div>
            <p className="font-medium">CRM mis à jour par l'IA :</p>
            <ul className="mt-1 text-sm">
              {updates.map((u, i) => (
                <li key={i}>• {u}</li>
              ))}
            </ul>
          </div>
        );
      } else {
        toast.success('Note ajoutée au lead');
      }

      onUpdate?.(note);
      setNote('');
    }, 1200);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-heading text-sm font-medium">Mise à jour par langage naturel</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Écrivez une note simple et l'IA mettra à jour le CRM automatiquement.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder='Ex : "Appel fait, intéressé mais doit en parler avec associé"'
          className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing || !note.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );
}
