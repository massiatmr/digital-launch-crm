import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Send, Sparkles, Mic, MicOff, Check, X, RotateCcw, Search, MessageSquare, Zap, UserPlus, Copy, Trash2 } from 'lucide-react';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { toast } from 'sonner';
import { useLeads, useAnalyzeNote, useApplyProposal, useCreateLead, AiProposal, DbLead } from '@/hooks/useLeadData';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
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
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
  proposal: 'Proposition', won: 'Gagné', lost: 'Perdu',
};

const SCORE_LABELS: Record<string, string> = {
  hot: '🔥 Chaud', warm: '🟡 Tiède', cold: '❄️ Froid',
};

const QUICK_SUGGESTIONS = [
  'Résumé du pipeline',
  'Leads à rappeler',
  'Leads chauds sans action',
  'Taux de conversion',
];

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function useSpeechRecognition(onResult: (text: string) => void, onInterim?: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wantListening = useRef(false);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stop = useCallback(() => {
    wantListening.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (finalTranscript) onResult(finalTranscript);
      if (interimTranscript) onInterim?.(interimTranscript);
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        wantListening.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we still want to be listening
      if (wantListening.current) {
        try { recognition.start(); } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    wantListening.current = true;
    recognition.start();
    setIsListening(true);
  }, [onResult, onInterim]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => { wantListening.current = false; recognitionRef.current?.stop(); };
  }, []);

  return { isListening, toggle, isSupported };
}

type Mode = 'action' | 'ask';

export function GlobalNaturalLanguageInput({ onDone }: { onDone?: () => void }) {
  const { data: leads = [] } = useLeads();
  const [mode, setMode] = useState<Mode>('action');
  const [selectedLead, setSelectedLead] = useState<DbLead | null>(null);
  const [note, setNote] = useState('');
  const [interimText, setInterimText] = useState('');
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [askingAi, setAskingAi] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();
  const createLead = useCreateLead();

  const handleVoiceResult = useCallback((text: string) => {
    setNote(prev => prev ? prev + ' ' + text : text);
    setInterimText('');
  }, []);

  const handleInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const { isListening, toggle: toggleMic, isSupported: micSupported } = useSpeechRecognition(handleVoiceResult, handleInterim);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    if (mode === 'ask') {
      const userMsg: ChatMessage = { role: 'user', content: note.trim() };
      setMessages(prev => [...prev, userMsg]);
      setNote('');
      if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
      setAskingAi(true);

      try {
        const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
          body: {
            type: 'pipeline_question',
            lead: { new_note: note, pipeline_summary: pipelineSummary },
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const answer = data?.answer || 'Pas de réponse.';
        setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      } catch {
        toast.error("Erreur lors de la requête IA");
        setMessages(prev => [...prev, { role: 'assistant', content: "Désolé, une erreur s'est produite." }]);
      } finally {
        setAskingAi(false);
      }
      return;
    }

    // Action mode
    if (!selectedLead) {
      setCreatingLead(true);
      try {
        const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
          body: { type: 'create_lead', lead: { new_note: note } },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        await createLead.mutateAsync({
          name: data.name || 'Lead inconnu',
          email: data.email || '',
          phone: data.phone || '',
          message: data.message || '',
          source: data.source || 'manual',
        });
        toast.success(`Lead "${data.name}" créé avec succès !`);
        setNote('');
        onDone?.();
      } catch {
        toast.error("Erreur lors de la création du lead");
      } finally {
        setCreatingLead(false);
      }
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
      onDone?.();
    } catch {
      toast.error("Erreur lors de l'exécution");
    }
  };

  const handleCorrect = () => { setShowDialog(false); setProposal(null); };

  const proposalItems = proposal ? [
    proposal.status && `Statut → ${STATUS_LABELS[proposal.status] || proposal.status}`,
    proposal.score && `Score → ${SCORE_LABELS[proposal.score] || proposal.score}`,
    proposal.next_action && `Prochaine action : ${proposal.next_action}`,
    proposal.next_action_date && `Date : ${new Date(proposal.next_action_date).toLocaleDateString('fr-FR')}`,
    proposal.notes_append && `Note ajoutée : "${proposal.notes_append}"`,
  ].filter(Boolean) as string[] : [];

  const isPending = analyze.isPending || askingAi || creatingLead;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  return (
    <>
      <div className="w-full">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-3">
          <button
            type="button"
            onClick={() => { setMode('action'); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
              mode === 'action' ? 'gradient-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <Zap className="h-3 w-3" /> Action IA
          </button>
          <button
            type="button"
            onClick={() => { setMode('ask'); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
              mode === 'ask' ? 'gradient-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare className="h-3 w-3" /> Question IA
          </button>
          {mode === 'ask' && messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Effacer
            </button>
          )}
        </div>

        {/* Chat messages */}
        {mode === 'ask' && messages.length > 0 && (
          <div className="mb-3 max-h-96 overflow-y-auto custom-scrollbar space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full gradient-primary">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'bg-primary/15 text-foreground'
                    : 'bg-muted/50 text-foreground'
                )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-1.5 [&>ul]:mb-1.5 [&>ol]:mb-1.5">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(msg.content)}
                      className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                  )}
                </div>
              </div>
            ))}
            {askingAi && (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full gradient-primary">
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="flex items-center gap-1 px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Quick suggestions */}
        {mode === 'ask' && messages.length === 0 && !askingAi && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {QUICK_SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setNote(s)}
                className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Lead selector - only in action mode */}
          {mode === 'action' && (
            <div className="flex items-center gap-2">
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all duration-200",
                      selectedLead
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border/50 bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <Search className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {selectedLead ? selectedLead.name : 'Sélectionner un lead (ou laisser vide pour créer)'}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-2" align="start">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
                    {filteredLeads.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 text-center">Aucun lead trouvé</p>
                    ) : (
                      filteredLeads.map(lead => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => { setSelectedLead(lead); setPopoverOpen(false); setSearchQuery(''); }}
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
              {selectedLead && (
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="rounded-lg border border-border/50 px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <AudioVisualizer isListening={isListening} className="mb-1" />
          <div className="flex gap-2 items-end">
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={cn(
                  "flex items-center justify-center rounded-lg border px-2.5 py-2.5 transition-all duration-200",
                  isListening
                    ? 'border-destructive/50 bg-destructive/10 text-destructive animate-glow'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title={isListening ? 'Arrêter' : 'Dicter'}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={isListening && interimText ? note + (note ? ' ' : '') + interimText : note}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                isListening
                  ? 'Parlez maintenant...'
                  : mode === 'action'
                    ? (selectedLead ? 'Ex : "hésite sur le prix, rappeler dans 3 jours"' : 'Ex : "nouveau lead Jean Dupont, 0612345678"')
                    : 'Ex : "combien de leads à rappeler ?"'
              }
              className="flex-1 min-w-0 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-all"
              style={{ maxHeight: '120px' }}
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !note.trim()}
              className="flex items-center gap-1 rounded-lg gradient-primary px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
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
