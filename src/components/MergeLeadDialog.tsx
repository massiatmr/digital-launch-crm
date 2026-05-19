import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Merge, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/phone';

type Candidate = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  source: string | null;
  created_at: string;
};

export function MergeLeadDialog({
  open,
  onOpenChange,
  currentLeadId,
  currentLeadName,
  workspaceId,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentLeadId: string;
  currentLeadName: string;
  workspaceId: string | null;
  onMerged?: (keptId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  // direction = "keep_current" → on garde le lead courant, on fusionne le `selected` dedans
  // direction = "keep_other"   → on garde le `selected`, on fusionne le lead courant dedans
  const [direction, setDirection] = useState<'keep_current' | 'keep_other'>('keep_current');
  const [merging, setMerging] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setDirection('keep_current');
    }
  }, [open]);

  // recherche debouncée
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const handle = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from('leads')
        .select('id, name, phone, email, company_name, source, created_at')
        .is('deleted_at', null)
        .neq('id', currentLeadId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      if (term.length >= 2) {
        q = q.or(
          `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company_name.ilike.%${term}%`,
        );
      }
      const { data, error } = await q;
      if (!error && data) setResults(data as Candidate[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, currentLeadId, workspaceId]);

  const handleMerge = async () => {
    if (!selected) return;
    const target = direction === 'keep_current' ? currentLeadId : selected.id;
    const source = direction === 'keep_current' ? selected.id : currentLeadId;
    setMerging(true);
    try {
      const { error } = await (supabase.rpc as any)('merge_leads', {
        p_source: source,
        p_target: target,
      });
      if (error) throw error;
      toast.success('Leads fusionnés');
      // Invalidate everything lead-related
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-inbox'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      onMerged?.(target);
      onOpenChange(false);
    } catch (e: any) {
      console.error('merge_leads failed', e);
      toast.error(`Échec de la fusion : ${e?.message ?? 'erreur inconnue'}`);
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4 text-primary" />
            Fusionner avec un autre lead
          </DialogTitle>
          <DialogDescription>
            Toutes les conversations, tâches, rappels et notes du doublon seront déplacés vers le lead conservé. Le doublon est archivé (corbeille, récupérable 30 jours).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, téléphone, email, entreprise…"
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-64 rounded-md border border-border">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Aucun lead trouvé
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition hover:bg-muted/50',
                        selected?.id === c.id && 'bg-primary/10',
                      )}
                    >
                      <span className="font-medium">{c.name || 'Sans nom'}</span>
                      <span className="text-xs text-muted-foreground">
                        {[c.company_name, c.phone ? formatPhoneDisplay(c.phone) : null, c.email]
                          .filter(Boolean)
                          .join(' · ') || c.source || '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          {selected && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Quel lead garder ?</p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  checked={direction === 'keep_current'}
                  onChange={() => setDirection('keep_current')}
                />
                <span>
                  Garder <strong>{currentLeadName}</strong> <span className="text-muted-foreground">(lead actuel)</span> et y déplacer les données de{' '}
                  <strong>{selected.name || '—'}</strong>.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  checked={direction === 'keep_other'}
                  onChange={() => setDirection('keep_other')}
                />
                <span>
                  Garder <strong>{selected.name || '—'}</strong> et y déplacer les données de{' '}
                  <strong>{currentLeadName}</strong> <span className="text-muted-foreground">(lead actuel sera archivé)</span>.
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={merging}>
            Annuler
          </Button>
          <Button onClick={handleMerge} disabled={!selected || merging}>
            {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}
            Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
