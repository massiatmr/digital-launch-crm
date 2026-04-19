import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Send, Sparkles, Mic, MicOff, Check, X, RotateCcw, Search, MessageSquare, Zap, UserPlus, Copy, Trash2, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
import { motion, AnimatePresence } from 'framer-motion';

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

// --- Fuzzy matching helper ---
function normalizeStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function fuzzyMatchLead(text: string, leads: DbLead[]): DbLead | null {
  const normalized = normalizeStr(text);
  // Try exact name match first
  for (const lead of leads) {
    const leadName = normalizeStr(lead.name);
    if (normalized.includes(leadName) && leadName.length >= 3) {
      return lead;
    }
  }
  // Try first name match (first word of name)
  for (const lead of leads) {
    const firstName = normalizeStr(lead.name).split(/\s+/)[0];
    if (firstName.length >= 3 && normalized.includes(firstName)) {
      return lead;
    }
  }
  // Try company name
  for (const lead of leads) {
    if (lead.company_name) {
      const company = normalizeStr(lead.company_name);
      if (company.length >= 3 && normalized.includes(company)) {
        return lead;
      }
    }
  }
  return null;
}

// --- Speech Recognition Hook ---
function useSpeechRecognition(
  onResult: (text: string) => void,
  onInterim?: (text: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wantListening = useRef(false);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);

  // Keep refs fresh without recreating recognition
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  const speechSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const recorderSupported = typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';
  const isSupported = speechSupported || recorderSupported;

  const clearRecorder = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const transcribeRecording = useCallback(async (blob: Blob) => {
    if (!blob.size) return;

    setIsTranscribing(true);

    try {
      const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `voice-note.${extension}`, { type: blob.type || 'audio/webm' });
      const formData = new FormData();
      formData.append('type', 'transcribe_audio');
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: formData,
      });

      if (error) throw error;
      const transcript = typeof data?.text === 'string' ? data.text.trim() : '';

      if (!transcript) {
        toast.error('Transcription vide, réessaie en parlant un peu plus fort.');
        return;
      }

      onResultRef.current(transcript);
      onInterimRef.current?.('');
    } catch {
      toast.error('Impossible de transcrire l’audio pour le moment.');
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const stop = useCallback(() => {
    wantListening.current = false;
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const startSpeechRecognition = useCallback(() => {
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
      if (finalTranscript) onResultRef.current(finalTranscript);
      if (interimTranscript) onInterimRef.current?.(interimTranscript);
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
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
  }, []);

  const startRecorder = useCallback(async () => {
    if (!recorderSupported) return;

    try {
      onInterimRef.current?.('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      wantListening.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        clearRecorder();
        await transcribeRecording(audioBlob);
      };

      recorder.onerror = () => {
        clearRecorder();
        setIsListening(false);
        toast.error('Impossible d’utiliser le micro.');
      };

      recorder.start();
      setIsListening(true);
    } catch {
      clearRecorder();
      setIsListening(false);
      toast.error('Accès micro refusé ou indisponible.');
    }
  }, [clearRecorder, recorderSupported, transcribeRecording]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else if (speechSupported) startSpeechRecognition();
    else void startRecorder();
  }, [isListening, speechSupported, startSpeechRecognition, startRecorder, stop]);

  useEffect(() => {
    return () => {
      wantListening.current = false;
      recognitionRef.current?.stop();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      clearRecorder();
    };
  }, [clearRecorder]);

  return { isListening, isTranscribing, toggle, isSupported, stop };
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [detectedLeadName, setDetectedLeadName] = useState<string | null>(null);
  const [bookingIntent, setBookingIntent] = useState<any | null>(null);
  const [bookingSlots, setBookingSlots] = useState<string[] | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const { user } = useAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();
  const createLead = useCreateLead();

  // --- Voice result with smart lead detection ---
  const handleVoiceResult = useCallback((text: string) => {
    setNote(prev => prev ? prev + ' ' + text : text);
    setInterimText('');

    // Try to auto-detect lead from voice
    if (mode === 'action' && !selectedLead) {
      const fullText = note + ' ' + text;
      const matched = fuzzyMatchLead(fullText, leads);
      if (matched) {
        setSelectedLead(matched);
        setDetectedLeadName(matched.name);
        // Clear detection badge after 4s
        setTimeout(() => setDetectedLeadName(null), 4000);
      }
    }
  }, [leads, mode, selectedLead, note]);

  const handleInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const { isListening, isTranscribing, toggle: toggleMic, isSupported: micSupported, stop: stopMic } = useSpeechRecognition(handleVoiceResult, handleInterim);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    // Stop mic on submit
    if (isListening) stopMic();
    setVoiceMode(false);

    if (mode === 'ask') {
      const userMsg: ChatMessage = { role: 'user', content: note.trim() };
      setMessages(prev => [...prev, userMsg]);
      setNote('');
      setInterimText('');
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
    // === 0. Détection intention RDV (check / book) ===
    try {
      const { data: intent } = await supabase.functions.invoke('ai-lead-analysis', {
        body: { type: 'booking_intent', lead: { new_note: note } },
      });
      if (intent?.is_booking_intent && intent?.date) {
        setBookingLoading(true);
        // Toujours check les dispos d'abord
        const { data: avail } = await supabase.functions.invoke('check-availability', {
          body: { owner_id: user?.id, date: intent.date },
        });
        const slots: string[] = avail?.slots || [];
        setBookingSlots(slots);
        setBookingIntent(intent);
        setBookingLoading(false);
        if (intent.subtype === 'check' || !intent.time_slot) {
          // Juste afficher les créneaux
          return;
        }
        // Sous-type "book" + créneau précis : vérifier qu'il est dispo
        if (!slots.includes(intent.time_slot)) {
          toast.error(`Créneau ${intent.time_slot} indisponible le ${intent.date}. Voici les autres dispos.`);
          return;
        }
        // Créneau OK → on attend confirmation via le dialog booking
        return;
      }
    } catch (err) {
      // Si l'IA n'arrive pas à détecter, on continue le flow normal
      console.warn('booking_intent failed', err);
      setBookingLoading(false);
    }

    if (!selectedLead) {
      setCreatingLead(true);
      try {
        const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
          body: { type: 'create_lead', lead: { new_note: note } },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Insert lead with all AI-extracted fields
        const { data: createdLead, error: insertError } = await supabase
          .from('leads')
          .insert({
            name: data.name || 'Lead inconnu',
            email: data.email || '',
            phone: data.phone || '',
            message: data.message || '',
            source: (data.source || 'manual') as any,
            company_name: data.company_name || '',
            score: (data.score || 'cold') as any,
            status: (data.status || 'new') as any,
            show_status: (data.show_status || 'pending') as any,
            lost_reason: data.lost_reason || '',
            next_action: data.next_action || '',
            next_action_date: data.next_action_date || null,
            last_contacted_at: data.last_contacted_at || null,
            sales_angle: data.sales_angle || '',
            ai_summary: data.ai_summary || '',
            notes: data.notes || '',
          })
          .select()
          .single();
        if (insertError) throw insertError;

        // Then trigger AI analysis for script/messages
        try {
          const { data: aiData } = await supabase.functions.invoke('ai-lead-analysis', {
            body: { type: 'analyze', lead: { name: data.name, email: data.email, phone: data.phone, message: data.message, source: data.source } },
          });
          if (aiData && !aiData.error && createdLead) {
            if (aiData.whatsapp_message) {
              await supabase.from('generated_messages').insert({ lead_id: createdLead.id, type: 'whatsapp', content: aiData.whatsapp_message });
            }
            if (aiData.script) {
              await supabase.from('sales_scripts').insert({ lead_id: createdLead.id, script: aiData.script, objections: aiData.objections || [] });
            }
          }
        } catch {}

        toast.success(`Lead "${data.name}" créé avec succès !`);
        setNote('');
        setInterimText('');
        // Invalidate queries
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
      setInterimText('');
      setProposal(null);
      setShowDialog(false);
      onDone?.();
    } catch {
      toast.error("Erreur lors de l'exécution");
    }
  };

  const handleCorrect = () => { setShowDialog(false); setProposal(null); };

  // === Booking helpers ===
  const resetBooking = () => { setBookingIntent(null); setBookingSlots(null); };

  const confirmBooking = async (timeSlot: string) => {
    if (!bookingIntent || !user?.id) return;
    setBookingLoading(true);
    try {
      // Trouver lead existant ou créer
      let leadMatch: DbLead | null = selectedLead;
      if (!leadMatch && bookingIntent.contact_name) {
        leadMatch = fuzzyMatchLead(bookingIntent.contact_name, leads);
      }

      // Trouver une offre par défaut (lead.offer_id ou première active)
      let offerId: string | null = leadMatch?.offer_id || null;
      let contactEmail = bookingIntent.contact_email || leadMatch?.email || '';
      let contactPhone = bookingIntent.contact_phone || leadMatch?.phone || '';
      let contactName = leadMatch?.name || bookingIntent.contact_name || 'RDV sans nom';

      if (!offerId) {
        const { data: offers } = await supabase
          .from('offers')
          .select('id')
          .eq('is_active', true)
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        offerId = offers?.[0]?.id || null;
      }
      if (!offerId) {
        toast.error("Aucune offre active trouvée. Crée une offre avant de réserver.");
        setBookingLoading(false);
        return;
      }
      if (!contactEmail) contactEmail = `rdv-${Date.now()}@placeholder.local`;
      if (!contactPhone) contactPhone = '+33000000000';

      const { data, error } = await supabase.functions.invoke('handle-booking', {
        body: {
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          booking_date: bookingIntent.date,
          time_slot: timeSlot,
          offer_id: offerId,
          notes: bookingIntent.notes || `Créé via assistant IA — "${note}"`,
          owner_id: user.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`✅ RDV créé : ${contactName} le ${bookingIntent.date} à ${timeSlot}${data?.meet_link ? ' (Meet créé)' : ''}`);
      setNote('');
      resetBooking();
      onDone?.();
    } catch (e) {
      console.error(e);
      toast.error('Échec création RDV : ' + (e as Error).message);
    } finally {
      setBookingLoading(false);
    }
  };


  const SHOW_STATUS_LABELS: Record<string, string> = {
    pending: 'En attente', show: 'Présent', noshow: 'Absent',
  };

  const proposalItems = proposal ? [
    proposal.status && `Statut → ${STATUS_LABELS[proposal.status] || proposal.status}`,
    proposal.score && `Score → ${SCORE_LABELS[proposal.score] || proposal.score}`,
    proposal.show_status && `Présence RDV → ${SHOW_STATUS_LABELS[proposal.show_status] || proposal.show_status}`,
    proposal.lost_reason && `Raison de perte : ${proposal.lost_reason}`,
    proposal.email && `Email → ${proposal.email}`,
    proposal.phone && `Téléphone → ${proposal.phone}`,
    proposal.company_name && `Entreprise → ${proposal.company_name}`,
    proposal.sales_angle && `Angle de vente → ${proposal.sales_angle}`,
    proposal.next_action && `Prochaine action : ${proposal.next_action}`,
    proposal.next_action_date && `Date : ${new Date(proposal.next_action_date).toLocaleDateString('fr-FR')}`,
    proposal.last_contacted_at && `Dernier contact : ${new Date(proposal.last_contacted_at).toLocaleDateString('fr-FR')}`,
    proposal.notes_append && `Note ajoutée : "${proposal.notes_append}"`,
  ].filter(Boolean) as string[] : [];

  const isPending = analyze.isPending || askingAi || creatingLead || isTranscribing || bookingLoading;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  const handleToggleVoice = () => {
    if (!micSupported) {
      toast.error('Le mode vocal n’est pas pris en charge par ce navigateur.');
      return;
    }

    if (isListening) {
      stopMic();
      setVoiceMode(false);
    } else {
      setVoiceMode(false);
      toggleMic();
    }
  };

  const displayText = isListening && interimText
    ? note + (note ? ' ' : '') + interimText
    : note;

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
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
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
              </motion.div>
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

        {/* Voice mode - full visual experience */}
        <AnimatePresence>
          {voiceMode && isListening && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="mb-4 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-6"
            >
              <AudioVisualizer isListening={isListening} variant="orbital" />

              {/* Detected lead badge */}
              <AnimatePresence>
                {detectedLeadName && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-3 flex items-center justify-center gap-2"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-xs font-medium text-primary">
                      <UserPlus className="h-3 w-3" />
                      Lead détecté : {detectedLeadName}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live transcript */}
              <div className="mt-4 min-h-[40px] rounded-xl bg-muted/30 border border-border/30 px-4 py-3">
                {displayText ? (
                  <p className="text-sm text-foreground">
                    {note}
                    {interimText && (
                      <span className="text-muted-foreground/70 italic"> {interimText}</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">Parlez, je vous écoute...</p>
                )}
              </div>

              {/* Stop button */}
              <div className="mt-4 flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleVoice}
                  className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <MicOff className="h-4 w-4 mr-1.5" /> Arrêter
                </Button>
                {note.trim() && (
                  <Button
                    size="sm"
                    onClick={(e) => handleSubmit(e as any)}
                    className="rounded-full gradient-primary text-white"
                    disabled={isPending}
                  >
                    <Send className="h-4 w-4 mr-1.5" /> Envoyer
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                      {selectedLead ? selectedLead.name : 'Sélectionner un lead (ou parlez son nom)'}
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

          {/* Inline visualizer when not in full voice mode */}
          {isListening && (
            <AudioVisualizer isListening={isListening} variant="inline" className="mb-1" />
          )}

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <motion.button
              type="button"
              onClick={handleToggleVoice}
              whileHover={micSupported ? { scale: 1.04 } : undefined}
              whileTap={micSupported ? { scale: 0.97 } : undefined}
              disabled={!micSupported || isTranscribing}
              aria-label={micSupported ? (isListening ? 'Arrêter le mode vocal' : 'Activer le mode vocal') : 'Mode vocal indisponible'}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all duration-300',
                isListening
                  ? 'border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_15px_hsl(var(--destructive)/0.2)]'
                  : micSupported
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50 hover:shadow-[0_0_12px_hsl(var(--primary)/0.15)]'
                    : 'border-border/60 bg-muted/40 text-muted-foreground opacity-100'
              )}
              title={micSupported ? (isListening ? 'Arrêter' : isTranscribing ? 'Transcription en cours' : 'Mode vocal') : 'Mode vocal indisponible sur ce navigateur'}
            >
              {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span className="hidden sm:inline">Vocal</span>
            </motion.button>
            <textarea
              ref={textareaRef}
              value={displayText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                isListening
                  ? 'Parlez, je transcris en direct...'
                  : isTranscribing
                    ? 'Transcription en cours...'
                  : mode === 'action'
                    ? (selectedLead ? 'Ex : "hésite sur le prix, rappeler dans 3 jours"' : 'Ex : "nouveau lead Jean Dupont, 0612345678"')
                    : 'Ex : "combien de leads à rappeler ?"'
              }
              className="flex-1 min-w-0 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-all"
              style={{ maxHeight: '120px' }}
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !note.trim()}
              className="flex items-center gap-1 rounded-xl gradient-primary px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-50"
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
