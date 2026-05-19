import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Merge, Search, Sparkles } from 'lucide-react';
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

type LeadFull = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  message: string | null;
  notes: string | null;
  source: string | null;
  offer_id: string | null;
  score: string | null;
  status: string | null;
  created_at: string;
};

type FieldKey =
  | 'name' | 'email' | 'phone' | 'company_name' | 'message' | 'notes'
  | 'source' | 'offer_id' | 'score' | 'status';

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Nom',
  email: 'Email',
  phone: 'Téléphone',
  company_name: 'Société',
  message: 'Message initial',
  notes: 'Notes',
  source: 'Source',
  offer_id: 'Offre liée',
  score: 'Score',
  status: 'Statut',
};

const FIELDS: FieldKey[] = ['name', 'email', 'phone', 'company_name', 'message', 'notes', 'source', 'offer_id', 'score', 'status'];

function displayValue(key: FieldKey, val: string | null, phoneFmt = true) {
  if (val === null || val === undefined || val === '') return '—';
  if (key === 'phone' && phoneFmt) return formatPhoneDisplay(val);
  if (key === 'offer_id') return val.slice(0, 8) + '…';
  return val.length > 60 ? val.slice(0, 60) + '…' : val;
}

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
  const [step, setStep] = useState<'search' | 'fields'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LeadFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LeadFull | null>(null);
  const [currentLead, setCurrentLead] = useState<LeadFull | null>(null);
  const [direction, setDirection] = useState<'keep_current' | 'keep_other'>('keep_current');
  // For each field: 'target' or 'source' — which lead's value to keep
  const [choices, setChoices] = useState<Record<FieldKey, 'target' | 'source'>(
    {} as Record<FieldKey, 'target' | 'source'>,
  )};
  const [merging, setMerging] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) {
      setStep('search');
      setQuery('');
      setResults([]);
      setSelected(null);
      setDirection('keep_current');
      setChoices({} as any);
    }
  }, [open]);

  // search
  useEffect(() => {
    if (!open || step !== 'search') return;
    const term = query.trim();
    const h = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from('leads')
        .select('id, name, phone, email, company_name, message, notes, source, offer_id, score, status, created_at')
        .is('deleted_at', null)
        .neq('id', currentLeadId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      if (term.length >= 2) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company_name.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (!error && data) setResults(data as any);
      setLoading(false);
    }, 200);
    return () => clearTimeout(h);
  }, [query, open, step, currentLeadId, workspaceId]);

  // target = lead conservé ; source = lead archivé
  const target = direction === 'keep_current' ? currentLead : selected;
  const source = direction === 'keep_current' ? selected : currentLead;

  const goToFieldsStep = async () => {
    if (!selected) return;
    // fetch full current lead
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, company_name, message, notes, source, offer_id, score, status, created_at')
      .eq('id', currentLeadId)
      .maybeSingle();
    if (error || !data) {
      toast.error('Impossible de charger le lead actuel');
      return;
    }
    setCurrentLead(data as any);
    // default = "prendre le plus complet" (valeur non vide priorisée)
    const init: Record<FieldKey, 'target' | 'source'> = {} as any;
    const tgt = direction === 'keep_current' ? data : selected;
    const src = direction === 'keep_current' ? selected : data;
    FIELDS.forEach((k) => {
      const tv = (tgt as any)[k];
      const sv = (src as any)[k];
      init[k] = (!tv || tv === '') && sv ? 'source' : 'target';
    });
    setChoices(init);
    setStep('fields');
  };

  const applyBulk = (which: 'target' | 'source' | 'auto') => {
    if (!target || !source) return;
    const next: Record<FieldKey, 'target' | 'source'> = {} as any;
    FIELDS.forEach((k) => {
      if (which === 'auto') {
        const tv = (target as any)[k];
        const sv = (source as any)[k];
        next[k] = (!tv || tv === '') && sv ? 'source' : 'target';
      } else {
        next[k] = which;
      }
    });
    setChoices(next);
  };

  const overrides = useMemo(() => {
    if (!target || !source) return {};
    const out: Record<string, string | null> = {};
    FIELDS.forEach((k) => {
      const pick = choices[k] === 'source' ? (source as any)[k] : (target as any)[k];
      // only include if it differs from current target value (to actually override)
      if ((target as any)[k] !== pick) {
        out[k] = pick ?? null;
      }
    });
    return out;
  }, [choices, target, source]);

  const handleMerge = async () => {
    if (!selected || !target || !source) return;
    setMerging(true);
    try {
      const { error } = await (supabase.rpc as any)('merge_leads', {
        p_source: source.id,
        p_target: target.id,
        p_field_overrides: overrides,
      });
      if (error) throw error;
      toast.success('Leads fusionnés');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-inbox'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      onMerged?.(target.id);
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
      <DialogContent className={cn(step === 'fields' ? 'max-w-3xl' : 'max-w-xl')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4 text-primary" />
            {step === 'search' ? 'Fusionner avec un autre lead' : 'Choisir les infos à garder'}
          </DialogTitle>
          <DialogDescription>
            {step === 'search'
              ? 'Toutes les conversations, tâches, rappels et notes du doublon seront déplacés vers le lead conservé. Le doublon est archivé (corbeille, 30 jours).'
              : 'Pour chaque champ, choisis la valeur à garder. Toutes les conversations des 2 leads seront regroupées sur le lead conservé.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'search' && (
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
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun lead trouvé</p>
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
                <p className="font-medium">Quel lead garder (avec ses conversations) ?</p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1 accent-primary"
                    checked={direction === 'keep_current'}
                    onChange={() => setDirection('keep_current')}
                  />
                  <span>
                    Garder <strong>{currentLeadName}</strong>{' '}
                    <span className="text-muted-foreground">(lead actuel)</span>
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
                    Garder <strong>{selected.name || '—'}</strong>
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {step === 'fields' && target && source && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => applyBulk('auto')}>
                <Sparkles className="mr-1 h-3 w-3" /> Prendre le plus complet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyBulk('target')}>
                Tout du conservé
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyBulk('source')}>
                Tout de l'archivé
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[110px_1fr_1fr] gap-px bg-border text-xs">
                <div className="bg-muted/50 px-3 py-2 font-medium">Champ</div>
                <div className="bg-muted/50 px-3 py-2 font-medium">
                  Conservé : <span className="text-primary">{target.name || '—'}</span>
                </div>
                <div className="bg-muted/50 px-3 py-2 font-medium">
                  Archivé : <span className="text-muted-foreground">{source.name || '—'}</span>
                </div>
                {FIELDS.map((k) => {
                  const tv = (target as any)[k];
                  const sv = (source as any)[k];
                  return (
                    <Fragment key={k}>

                      <div key={k + '-l'} className="bg-background px-3 py-2 text-muted-foreground">
                        {FIELD_LABELS[k]}
                      </div>
                      <label
                        key={k + '-t'}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 bg-background px-3 py-2 text-sm transition',
                          choices[k] === 'target' && 'bg-primary/10',
                        )}
                      >
                        <input
                          type="radio"
                          className="mt-0.5 accent-primary"
                          checked={choices[k] === 'target'}
                          onChange={() => setChoices((c) => ({ ...c, [k]: 'target' }))}
                        />
                        <span className={cn('break-words', (!tv || tv === '') && 'text-muted-foreground italic')}>
                          {displayValue(k, tv)}
                        </span>
                      </label>
                      <label
                        key={k + '-s'}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 bg-background px-3 py-2 text-sm transition',
                          choices[k] === 'source' && 'bg-primary/10',
                        )}
                      >
                        <input
                          type="radio"
                          className="mt-0.5 accent-primary"
                          checked={choices[k] === 'source'}
                          onChange={() => setChoices((c) => ({ ...c, [k]: 'source' }))}
                        />
                        <span className={cn('break-words', (!sv || sv === '') && 'text-muted-foreground italic')}>
                          {displayValue(k, sv)}
                        </span>
                      </label>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'fields' && (
            <Button variant="ghost" onClick={() => setStep('search')} disabled={merging}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Retour
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={merging}>
            Annuler
          </Button>
          {step === 'search' ? (
            <Button onClick={goToFieldsStep} disabled={!selected}>
              Suivant
            </Button>
          ) : (
            <Button onClick={handleMerge} disabled={merging}>
              {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}
              Fusionner
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
