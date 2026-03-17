import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Sparkles, Mic, MicOff, Check, X, RotateCcw } from 'lucide-react';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { toast } from 'sonner';
import { useAnalyzeNote, useApplyProposal, AiProposal, DbLead } from '@/hooks/useLeadData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NaturalLanguageInputProps {
  leadId: string;
  lead: DbLead;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
  proposal: 'Proposition', won: 'Gagné', lost: 'Perdu',
};

const SCORE_LABELS: Record<string, string> = {
  hot: '🔥 Chaud', warm: '🟡 Tiède', cold: '❄️ Froid',
};

function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wantListening = useRef(false);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggle = useCallback(() => {
    if (isListening) {
      wantListening.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) onResult(finalTranscript);
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        wantListening.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
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
  }, [isListening, onResult]);

  useEffect(() => {
    return () => { wantListening.current = false; recognitionRef.current?.stop(); };
  }, []);

  return { isListening, toggle, isSupported };
}

export function NaturalLanguageInput({ leadId, lead }: NaturalLanguageInputProps) {
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();

  const handleVoiceResult = useCallback((text: string) => {
    setNote(prev => prev ? prev + ' ' + text : text);
  }, []);

  const { isListening, toggle: toggleMic, isSupported: micSupported } = useSpeechRecognition(handleVoiceResult);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      const result = await analyze.mutateAsync({ lead, note });
      setProposal(result);
      setShowDialog(true);
    } catch {
      toast.error("Erreur lors de l'analyse IA");
    }
  };

  const handleValidate = async () => {
    if (!proposal) return;
    try {
      await apply.mutateAsync({ lead, proposal });
      toast.success(
        <div>
          <p className="font-medium">CRM mis à jour :</p>
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

  const handleCorrect = () => { setShowDialog(false); setProposal(null); };

  const proposalItems = proposal ? [
    proposal.status && `Statut → ${STATUS_LABELS[proposal.status] || proposal.status}`,
    proposal.score && `Score → ${SCORE_LABELS[proposal.score] || proposal.score}`,
    proposal.next_action && `Prochaine action : ${proposal.next_action}`,
    proposal.next_action_date && `Date : ${new Date(proposal.next_action_date).toLocaleDateString('fr-FR')}`,
    proposal.notes_append && `Note ajoutée : "${proposal.notes_append}"`,
  ].filter(Boolean) as string[] : [];

  return (
    <>
      <form onSubmit={handleSubmit} className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Mise à jour par voix ou texte</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Dictez ou écrivez une note, l'IA proposera les actions à valider.
        </p>
        <AudioVisualizer isListening={isListening} className="mb-3" />
        <div className="flex gap-2">
          {micSupported && (
            <button
              type="button"
              onClick={toggleMic}
              className={cn(
                "flex items-center justify-center rounded-lg border px-3 py-2.5 transition-all duration-200",
                isListening
                  ? 'border-destructive/50 bg-destructive/10 text-destructive animate-glow'
                  : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
            placeholder={isListening ? 'Parlez maintenant...' : 'Ex : "Appel fait, intéressé mais hésite"'}
            className="flex-1 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
            disabled={analyze.isPending}
          />
          <button
            type="submit"
            disabled={analyze.isPending || !note.trim()}
            className="flex items-center gap-1.5 rounded-lg gradient-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-50"
          >
            {analyze.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
              Voici les modifications proposées pour <strong>{lead.name}</strong>. Validez ou corrigez.
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
