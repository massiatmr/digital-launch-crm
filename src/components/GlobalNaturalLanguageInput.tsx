import { useState, useCallback } from 'react';
import { Send, Sparkles, Mic, MicOff, Check, X, RotateCcw, Search } from 'lucide-react';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { toast } from 'sonner';
import { useLeads, useAnalyzeNote, useApplyProposal, AiProposal, DbLead } from '@/hooks/useLeadData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  qualified: 'Qualifié',
  proposal: 'Proposition',
  won: 'Gagné',
  lost: 'Perdu',
};

const SCORE_LABELS: Record<string, string> = {
  hot: '🔥 Chaud',
  warm: '🟡 Tiède',
  cold: '❄️ Froid',
};

function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = { current: null as any };

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggle = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onResult]);

  return { isListening, toggle, isSupported };
}

export function GlobalNaturalLanguageInput() {
  const { data: leads = [] } = useLeads();
  const [selectedLead, setSelectedLead] = useState<DbLead | null>(null);
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();

  const handleVoiceResult = useCallback((text: string) => {
    setNote(prev => prev ? prev + ' ' + text : text);
  }, []);

  const { isListening, toggle: toggleMic, isSupported: micSupported } = useSpeechRecognition(handleVoiceResult);

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || !selectedLead) {
      if (!selectedLead) toast.error('Sélectionnez un lead d\'abord');
      return;
    }

    try {
      const result = await analyze.mutateAsync({ lead: selectedLead, note });
      setProposal(result);
      setShowDialog(true);
    } catch {
      toast.error("Erreur lors de l'analyse IA");
    }
  };

  const handleValidate = async () => {
    if (!proposal || !selectedLead) return;
    try {
      await apply.mutateAsync({ lead: selectedLead, proposal });
      toast.success(
        <div>
          <p className="font-medium">CRM mis à jour pour {selectedLead.name} :</p>
          <ul className="mt-1 text-sm">
            {(proposal.updates_summary || []).map((u, i) => (
              <li key={i}>• {u}</li>
            ))}
          </ul>
        </div>
      );
      setNote('');
      setProposal(null);
      setShowDialog(false);
    } catch {
      toast.error("Erreur lors de l'exécution");
    }
  };

  const handleCorrect = () => {
    setShowDialog(false);
    setProposal(null);
  };

  const proposalItems = proposal ? [
    proposal.status && `Statut → ${STATUS_LABELS[proposal.status] || proposal.status}`,
    proposal.score && `Score → ${SCORE_LABELS[proposal.score] || proposal.score}`,
    proposal.next_action && `Prochaine action : ${proposal.next_action}`,
    proposal.next_action_date && `Date : ${new Date(proposal.next_action_date).toLocaleDateString('fr-FR')}`,
    proposal.notes_append && `Note ajoutée : "${proposal.notes_append}"`,
  ].filter(Boolean) as string[] : [];

  return (
    <>
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm font-medium">Mise à jour rapide</h3>
        </div>

        {/* Lead selector */}
        <div className="mb-3">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  selectedLead
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground"
                )}
              >
                <Search className="h-3.5 w-3.5 shrink-0" />
                {selectedLead ? selectedLead.name : 'Sélectionner un lead...'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-2" align="start">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filteredLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2 text-center">Aucun lead trouvé</p>
                ) : (
                  filteredLeads.map(lead => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setSelectedLead(lead);
                        setPopoverOpen(false);
                        setSearchQuery('');
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                        selectedLead?.id === lead.id && "bg-primary/10 text-primary"
                      )}
                    >
                      <span className="truncate">{lead.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground capitalize">{lead.status}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2">
          {micSupported && (
            <button
              type="button"
              onClick={toggleMic}
              className={cn(
                "flex items-center justify-center rounded-lg border px-3 py-2.5 transition-colors",
                isListening
                  ? 'border-destructive bg-destructive/10 text-destructive animate-pulse'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              title={isListening ? 'Arrêter' : 'Dicter'}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isListening ? 'Parlez maintenant...' : 'Ex : "Frederik rappeler dans 3 jours, hésite sur le prix"'}
            className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={analyze.isPending}
          />
          <button
            type="submit"
            disabled={analyze.isPending || !note.trim() || !selectedLead}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {analyze.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposition de l'IA</DialogTitle>
            <DialogDescription>
              Modifications proposées pour <strong>{selectedLead?.name}</strong>. Validez ou corrigez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">Votre note :</p>
            <p className="text-sm italic text-foreground bg-muted/40 rounded-lg p-3">"{note}"</p>

            {proposalItems.length > 0 ? (
              <ul className="space-y-1.5 mt-3">
                {proposalItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-3">Aucune modification détectée.</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCorrect} disabled={apply.isPending}>
              <RotateCcw className="h-4 w-4 mr-1" /> Corriger
            </Button>
            <Button variant="ghost" onClick={() => { setShowDialog(false); setNote(''); setProposal(null); }} disabled={apply.isPending}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button onClick={handleValidate} disabled={apply.isPending || proposalItems.length === 0}>
              {apply.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
