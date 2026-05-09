import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function SuggestedReplies({
  leadId,
  enabled,
  onPick,
}: {
  leadId: string;
  enabled: boolean;
  onPick: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-replies', {
        body: { lead_id: leadId },
      });
      if (error) throw error;
      const arr = (data as any)?.suggestions;
      if (Array.isArray(arr) && arr.length > 0) setSuggestions(arr.slice(0, 3));
      else throw new Error('Pas de suggestions');
    } catch (e: any) {
      toast.error(e.message || 'Erreur suggestions');
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) return null;

  if (!suggestions && !loading) {
    return (
      <div className="border-t border-border px-3 py-1.5 flex items-center gap-2 bg-muted/10">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={fetchSuggestions}>
          Suggérer 3 réponses IA
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border-t border-border px-3 py-2 flex items-center gap-2 bg-muted/10 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Génération…
      </div>
    );
  }

  return (
    <div className="border-t border-border px-2 py-2 bg-muted/10 space-y-1.5">
      <div className="flex items-center gap-1 px-1">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Suggestions IA</span>
        <Button size="icon" variant="ghost" className="h-5 w-5 ml-auto" onClick={fetchSuggestions} title="Régénérer">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        {suggestions!.map((s, i) => (
          <button
            key={i}
            onClick={() => { onPick(s); setSuggestions(null); }}
            className="text-left text-xs bg-card hover:bg-primary/10 border border-border rounded-lg px-2 py-1.5 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
