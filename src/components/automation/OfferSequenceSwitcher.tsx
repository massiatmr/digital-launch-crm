import { useOffers } from '@/hooks/useOfferData';
import { useOfferSequenceCounts, useDuplicateSequence, useDeleteOfferSequence, useSequenceSteps, type SequenceKind } from '@/hooks/useSequenceSteps';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Copy, Trash2, Sparkles, AlertTriangle, Bot, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string | null;
  onChange: (offerId: string | null) => void;
  kind?: SequenceKind;
  onKindChange?: (kind: SequenceKind) => void;
}

export function OfferSequenceSwitcher({ value, onChange, kind = 'qualification', onKindChange }: Props) {
  const { data: offers = [] } = useOffers();
  const { data: counts = {} } = useOfferSequenceCounts(kind);
  const { data: currentSteps = [] } = useSequenceSteps(value, kind);
  const duplicate = useDuplicateSequence();
  const delOfferSeq = useDeleteOfferSequence();

  const isOffer = typeof value === 'string';
  const isEmpty = currentSteps.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 sm:p-4 sticky top-0 z-10 backdrop-blur-md space-y-3">
      {/* Kind switcher */}
      {onKindChange && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Contexte</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-background">
            <button
              type="button"
              onClick={() => onKindChange('qualification')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                kind === 'qualification' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Bot className="h-3.5 w-3.5" /> Qualification IA
            </button>
            <button
              type="button"
              onClick={() => onKindChange('website_booking')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                kind === 'website_booking' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe className="h-3.5 w-3.5" /> RDV direct site
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {kind === 'qualification'
              ? 'Leads Meta / formulaire — séquence de qualification'
              : 'Landing page externe — le RDV est déjà pris'}
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Séquence pour</span>
        </div>

        <Select value={value ?? '__default__'} onValueChange={(v) => onChange(v === '__default__' ? null : v)}>
          <SelectTrigger className="flex-1 sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">
              <span className="flex items-center gap-2">
                <span className="font-medium">Par défaut</span>
                <span className="text-xs text-muted-foreground">(toutes offres sans séquence dédiée)</span>
              </span>
            </SelectItem>
            {offers.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-t mt-1 pt-2">Offres</div>
            )}
            {offers.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span className="flex items-center gap-2">
                  <span>{o.name}</span>
                  {counts[o.id] ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                      {counts[o.id]} étape{counts[o.id] > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">(par défaut)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isOffer && (
          <div className="flex gap-2">
            {isEmpty && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => duplicate.mutate({ sourceOfferId: null, destOfferId: value, kind })}
                disabled={duplicate.isPending}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Dupliquer depuis Par défaut
              </Button>
            )}
            {!isEmpty && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirm('Supprimer la séquence dédiée à cette offre ? Les nouveaux leads de cette offre utiliseront la séquence par défaut.')) {
                    delOfferSeq.mutate({ offerId: value, kind });
                  }
                }}
                disabled={delOfferSeq.isPending}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </Button>
            )}
          </div>
        )}
      </div>

      {isOffer && isEmpty && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-300'
        )}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Aucune séquence dédiée — les leads de cette offre suivront la séquence <strong>Par défaut</strong>. Duplique-la pour personnaliser.</span>
        </div>
      )}
    </div>
  );
}
