import { useState, useCallback, useMemo } from 'react';
import { Send, Sparkles, Mic, MicOff, Check, X, RotateCcw, Search, MessageSquare, Zap, UserPlus } from 'lucide-react';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { toast } from 'sonner';
import { useLeads, useAnalyzeNote, useApplyProposal, useCreateLead, AiProposal, DbLead } from '@/hooks/useLeadData';
import { supabase } from '@/integrations/supabase/client';
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

type Mode = 'action' | 'ask';

export function GlobalNaturalLanguageInput() {
  const { data: leads = [] } = useLeads();
  const [mode, setMode] = useState<Mode>('action');
  const [selectedLead, setSelectedLead] = useState<DbLead | null>(null);
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [askingAi, setAskingAi] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);

  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();
  const createLead = useCreateLead();

  const handleVoiceResult = useCallback((text: string) => {
    setNote(prev => prev ? prev + ' ' + text : text);
  }, []);

  const { isListening, toggle: toggleMic, isSupported: micSupported } = useSpeechRecognition(handleVoiceResult);

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pipelineSummary = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byScore: Record<string, number> = {};
    leads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byScore[l.score] = (byScore[l.score] || 0) + 1;
    });
    const withNextAction = leads.filter(l => l.next_action).map(l => `- ${l.name}: ${l.next_action}`).slice(0, 10);
    const hotLeads = leads.filter(l => l.score === 'hot').map(l => `- ${l.name} (${STATUS_LABELS[l.status]}): ${l.notes?.slice(0, 100) || 'pas de notes'}`);
    const warmLeads = leads.filter(l => l.score === 'warm').map(l => `- ${l.name} (${STATUS_LABELS[l.status]})`);

    return `Total leads: ${leads.length}
Par statut: ${Object.entries(byStatus).map(([k, v]) => `${STATUS_LABELS[k] || k}: ${v}`).join(', ')}
Par score: ${Object.entries(byScore).map(([k, v]) => `${SCORE_LABELS[k] || k}: ${v}`).join(', ')}
Taux de closing: ${leads.length > 0 ? Math.round((byStatus['won'] || 0) / leads.length * 100) : 0}%
Leads chauds:\n${hotLeads.join('\n') || 'Aucun'}
Leads tièdes:\n${warmLeads.join('\n') || 'Aucun'}
Prochaines actions:\n${withNextAction.join('\n') || 'Aucune'}`;
  }, [leads]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    if (mode === 'ask') {
      setAskingAi(true);
      setAiAnswer(null);
      try {
        const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
          body: {
            type: 'pipeline_question',
            lead: { new_note: note, pipeline_summary: pipelineSummary },
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setAiAnswer(data?.answer || 'Pas de réponse.');
      } catch (err: any) {
        toast.error("Erreur lors de la requête IA");
      } finally {
        setAskingAi(false);
      }
      return;
    }

    // Action mode
    if (!selectedLead) {
      // No lead selected → create a new lead via AI
      setCreatingLead(true);
      try {
        const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
          body: { type: 'create_lead', lead: { new_note: note } },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Insert the lead
        await createLead.mutateAsync({
          name: data.name || 'Lead inconnu',
          email: data.email || '',
          phone: data.phone || '',
          message: data.message || '',
          source: data.source || 'manual',
        });
        toast.success(`Lead "${data.name}" créé avec succès !`);
        setNote('');
      } catch (err: any) {
        toast.error("Erreur lors de la création du lead");
      } finally {
        setCreatingLead(false);
      }
      return;
    }

    // Lead selected → update
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

  const isPending = analyze.isPending || askingAi;

  return (
    <>
      <div className="max-w-2xl">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-2">
          <button
            type="button"
            onClick={() => { setMode('action'); setAiAnswer(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              mode === 'action' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <Zap className="h-3 w-3" /> Action IA
          </button>
          <button
            type="button"
            onClick={() => { setMode('ask'); setAiAnswer(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              mode === 'ask' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare className="h-3 w-3" /> Question IA
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-medium text-muted-foreground">
              {mode === 'action' ? (selectedLead ? `Mise à jour de ${selectedLead.name}` : 'Ajouter ou mettre à jour un lead') : 'Demandez à l\'IA sur votre pipeline'}
            </h3>
          </div>

          {/* Lead selector - only in action mode */}
          {mode === 'action' && (
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                        selectedLead
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : "border-border bg-muted/30 text-muted-foreground"
                      )}
                    >
                      <Search className="h-3 w-3 shrink-0" />
                      {selectedLead ? selectedLead.name : 'Sélectionner un lead (ou laisser vide pour créer)'}
                    </button>
                  </PopoverTrigger>
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <Search className="h-3 w-3 shrink-0" />
                    {selectedLead ? selectedLead.name : 'Sélectionner un lead...'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-2" align="start">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
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
                            "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-accent",
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
          )}

          <AudioVisualizer isListening={isListening} className="mb-2" />
          <div className="flex gap-2">
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={cn(
                  "flex items-center justify-center rounded-lg border px-2.5 py-2 transition-colors",
                  isListening
                    ? 'border-destructive bg-destructive/10 text-destructive animate-pulse'
                    : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title={isListening ? 'Arrêter' : 'Dicter'}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
            )}
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                isListening
                  ? 'Parlez maintenant...'
                  : mode === 'update'
                    ? 'Ex : "hésite sur le prix, rappeler dans 3 jours"'
                    : 'Ex : "combien de leads à rappeler ?" "taux de closing ?"'
              }
              className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !note.trim() || (mode === 'update' && !selectedLead)}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </form>

        {/* AI answer for pipeline questions */}
        {aiAnswer && (
          <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-foreground whitespace-pre-line leading-relaxed">{aiAnswer}</div>
            </div>
            <button
              type="button"
              onClick={() => setAiAnswer(null)}
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Fermer
            </button>
          </div>
        )}
      </div>

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
