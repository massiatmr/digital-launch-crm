import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Send, Sparkles, Mic, MicOff, Copy, Trash2, Loader2, Paperclip, FileText } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BulkImportPreview, type MappedRow } from '@/components/BulkImportPreview';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { toast } from 'sonner';
import { useLeads, useApplyProposal, useCreateLead, useCreateReminder, type DbLead } from '@/hooks/useLeadData';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ActionCard, type ActionPayload, type ActionStatus } from '@/components/assistant/ActionCard';

const QUICK_SUGGESTIONS = [
  'Résumé de mon pipeline',
  'Quels leads dois-je rappeler ?',
  'Crée un rappel demain 10h pour Marc',
  'Nouveau lead : Sophie 0612345678',
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: { payload: ActionPayload; status: ActionStatus };
};

// --- Speech Recognition Hook (preserved from previous implementation) ---
function useSpeechRecognition(onResult: (text: string) => void, onInterim?: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wantListening = useRef(false);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const recorderSupported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const isSupported = speechSupported || recorderSupported;

  const clearRecorder = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const transcribeRecording = useCallback(async (blob: Blob) => {
    if (!blob.size) return;
    setIsTranscribing(true);
    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' });
      const fd = new FormData();
      fd.append('type', 'transcribe_audio');
      fd.append('file', file);
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', { body: fd });
      if (error) throw error;
      const transcript = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!transcript) { toast.error('Transcription vide.'); return; }
      onResultRef.current(transcript);
      onInterimRef.current?.('');
    } catch {
      toast.error('Impossible de transcrire l\'audio.');
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const stop = useCallback(() => {
    wantListening.current = false;
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setIsListening(false);
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      if (final) onResultRef.current(final);
      if (interim) onInterimRef.current?.(interim);
    };
    rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') { wantListening.current = false; setIsListening(false); } };
    rec.onend = () => { if (wantListening.current) { try { rec.start(); } catch {} } else setIsListening(false); };
    recognitionRef.current = rec;
    wantListening.current = true;
    rec.start();
    setIsListening(true);
  }, []);

  const startRecorder = useCallback(async () => {
    if (!recorderSupported) return;
    try {
      onInterimRef.current?.('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mt = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '';
      const recorder = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream);
      streamRef.current = stream; recorderRef.current = recorder; chunksRef.current = []; wantListening.current = true;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const bt = recorder.mimeType || mt || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: bt });
        clearRecorder();
        await transcribeRecording(blob);
      };
      recorder.onerror = () => { clearRecorder(); setIsListening(false); toast.error('Erreur micro.'); };
      recorder.start();
      setIsListening(true);
    } catch {
      clearRecorder(); setIsListening(false); toast.error('Accès micro refusé.');
    }
  }, [clearRecorder, recorderSupported, transcribeRecording]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else if (speechSupported) startSpeechRecognition();
    else void startRecorder();
  }, [isListening, speechSupported, startSpeechRecognition, startRecorder, stop]);

  useEffect(() => () => {
    wantListening.current = false;
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    clearRecorder();
  }, [clearRecorder]);

  return { isListening, isTranscribing, toggle, isSupported, stop };
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié', proposal: 'Proposition', won: 'Gagné', lost: 'Perdu',
};
const SCORE_LABELS: Record<string, string> = { hot: '🔥', warm: '🟡', cold: '❄️' };

const uid = () => Math.random().toString(36).slice(2);

export function GlobalNaturalLanguageInput({ onDone }: { onDone?: () => void }) {
  const { data: leads = [] } = useLeads();
  const { user } = useAuth();
  const wsId = useCurrentWorkspaceId();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [interimText, setInterimText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Bulk import
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<MappedRow[] | null>(null);
  const [bulkStats, setBulkStats] = useState<{ total: number; valid: number; duplicates: number; errors: number } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  const apply = useApplyProposal();
  const createLead = useCreateLead();
  const createReminder = useCreateReminder();

  const handleVoiceResult = useCallback((text: string) => {
    setInput((p) => (p ? p + ' ' + text : text));
    setInterimText('');
  }, []);
  const handleInterim = useCallback((text: string) => setInterimText(text), []);

  const { isListening, isTranscribing, toggle: toggleMic, isSupported: micSupported, stop: stopMic } = useSpeechRecognition(handleVoiceResult, handleInterim);

  // ---------- Bulk import (preserved) ----------
  const callBulkImport = useCallback(async (payload: { rows?: any[]; rawText?: string; fileBase64?: string; fileName?: string; mimeType?: string }) => {
    setBulkLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-bulk-import', { body: { ...payload, workspace_id: wsId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const rows = (data?.rows || []) as MappedRow[];
      if (rows.length === 0) { toast.error('Aucun lead détecté.'); return; }
      setBulkRows(rows); setBulkStats(data?.stats || null); setBulkOpen(true);
      toast.success(`${rows.length} ligne${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''}`);
    } catch (e: any) {
      const msg = e?.message || 'Erreur import';
      if (msg.includes('429')) toast.error('Trop de requêtes IA.');
      else if (msg.includes('402')) toast.error('Crédits IA épuisés.');
      else toast.error(msg);
    } finally { setBulkLoading(false); setAttachedFileName(null); }
  }, [wsId]);

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 5 MB)'); return; }
    setAttachedFileName(file.name);
    const ext = file.name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'csv' || file.type === 'text/csv') {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = (parsed.data as any[]).filter((r) => r && Object.values(r).some((v) => String(v ?? '').trim()));
        if (!rows.length) { toast.error('CSV vide.'); setAttachedFileName(null); return; }
        await callBulkImport({ rows }); return;
      }
      if (ext === 'xlsx' || ext === 'xls' || file.type.includes('spreadsheet') || file.type.includes('excel')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
        if (!rows.length) { toast.error('Excel vide.'); setAttachedFileName(null); return; }
        await callBulkImport({ rows }); return;
      }
      if (ext === 'txt' || file.type === 'text/plain') { await callBulkImport({ rawText: await file.text() }); return; }
      const base64 = await fileToBase64(file);
      await callBulkImport({ fileBase64: base64, fileName: file.name, mimeType: file.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream') });
    } catch (e) { console.error(e); toast.error('Impossible de lire ce fichier.'); setAttachedFileName(null); }
  }, [callBulkImport]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f);
  }, [handleFile]);
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '';
  };

  // ---------- Context for AI ----------
  const pipelineSummary = useMemo(() => {
    const byStatus: Record<string, number> = {}; const byScore: Record<string, number> = {};
    leads.forEach((l) => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; byScore[l.score] = (byScore[l.score] || 0) + 1; });
    const next = leads.filter((l) => l.next_action).slice(0, 8).map((l) => `- ${l.name}: ${l.next_action}`);
    return `Total: ${leads.length}
Statuts: ${Object.entries(byStatus).map(([k, v]) => `${STATUS_LABELS[k] || k}=${v}`).join(', ')}
Scores: ${Object.entries(byScore).map(([k, v]) => `${SCORE_LABELS[k] || k}=${v}`).join(', ')}
Prochaines actions:
${next.join('\n') || 'Aucune'}`;
  }, [leads]);

  const leadsIndex = useMemo(() => {
    return leads.slice(0, 80).map((l) => `${l.id} - ${l.name}${l.company_name ? ' (' + l.company_name + ')' : ''} - ${STATUS_LABELS[l.status] || l.status}`).join('\n');
  }, [leads]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); }
  };

  const updateMessage = (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m));
  };

  // ---------- Send to AI assistant ----------
  const sendToAI = async (history: ChatMessage[]) => {
    setThinking(true);
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('ai-assistant-chat', {
        body: { messages: apiMessages, context: { pipeline_summary: pipelineSummary, leads_index: leadsIndex, workspace_id: wsId } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const assistantId = uid();
      const intent: string = data.intent;
      const reply: string = data.assistant_reply || '';
      const payload = data.payload;

      const baseMsg: ChatMessage = { id: assistantId, role: 'assistant', content: reply };

      if (intent === 'update_lead' && payload?.lead_id) {
        baseMsg.action = { payload: { type: 'update_lead', ...payload }, status: 'pending' };
      } else if (intent === 'create_lead' && payload?.fields) {
        baseMsg.action = { payload: { type: 'create_lead', fields: payload.fields }, status: 'pending' };
      } else if (intent === 'booking' && payload?.date) {
        // Fetch slots immediately — derive offer_id server-side from user's active offer.
        let slots: string[] = [];
        try {
          const { data: offers } = await supabase.from('offers').select('id').eq('is_active', true).eq('owner_id', user!.id).order('created_at', { ascending: false }).limit(1);
          const offerId = offers?.[0]?.id;
          if (offerId) {
            const { data: avail } = await supabase.functions.invoke('check-availability', { body: { offer_id: offerId, date: payload.date } });
            slots = avail?.slots || [];
          }
        } catch {}
        baseMsg.action = { payload: { type: 'booking', ...payload, slots }, status: 'pending' };
      } else if (intent === 'reminder' && payload?.lead_id) {
        const lead = leads.find((l) => l.id === payload.lead_id);
        baseMsg.action = { payload: { type: 'reminder', ...payload, lead_name: payload.lead_name || lead?.name }, status: 'pending' };
      }

      setMessages((prev) => [...prev, baseMsg]);
    } catch (e: any) {
      const msg = e?.message || 'Erreur';
      if (msg.includes('429')) toast.error('Trop de requêtes IA.');
      else if (msg.includes('402')) toast.error('Crédits IA épuisés.');
      else toast.error(msg);
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: '⚠️ Désolé, une erreur est survenue.' }]);
    } finally { setThinking(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || thinking) return;
    if (isListening) stopMic();
    setVoiceMode(false);

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput(''); setInterimText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendToAI(next);
  };

  // ---------- Confirm action handlers ----------
  const confirmAction = async (msgId: string, payload: ActionPayload) => {
    updateMessage(msgId, (m) => ({ action: m.action ? { ...m.action, status: 'loading', payload } : undefined }));
    try {
      if (payload.type === 'update_lead') {
        const lead = leads.find((l) => l.id === payload.lead_id);
        if (!lead) throw new Error('Lead introuvable');
        await apply.mutateAsync({ lead, proposal: payload.changes as any });
        toast.success(`✅ ${lead.name} mis à jour`);
      } else if (payload.type === 'create_lead') {
        const f = payload.fields;
        await createLead.mutateAsync({
          name: f.name || 'Sans nom',
          email: f.email || '', phone: f.phone || '', company_name: f.company_name || '',
          message: f.message || '', notes: f.notes || '',
          source: (f.source || 'manual') as any, score: (f.score || 'cold') as any, status: (f.status || 'new') as any,
        } as any);
        toast.success(`✅ Lead "${f.name}" créé`);
      } else if (payload.type === 'reminder') {
        await createReminder.mutateAsync({ lead_id: payload.lead_id, action: payload.action, due_date: payload.due_date });
        toast.success('✅ Rappel créé');
      } else if (payload.type === 'booking') {
        if (!payload.time_slot) { toast.error('Choisis un créneau.'); throw new Error('no slot'); }
        await doBooking(payload, payload.time_slot);
      }
      updateMessage(msgId, (m) => ({ action: m.action ? { ...m.action, status: 'confirmed' } : undefined }));
      onDone?.();
    } catch (e: any) {
      console.error(e);
      if (e?.message !== 'no slot') toast.error('Erreur : ' + (e?.message || 'inconnue'));
      updateMessage(msgId, (m) => ({ action: m.action ? { ...m.action, status: 'pending' } : undefined }));
    }
  };

  const doBooking = async (payload: Extract<ActionPayload, { type: 'booking' }>, slot: string) => {
    if (!user?.id) throw new Error('Non authentifié');
    const lead = payload.lead_id ? leads.find((l) => l.id === payload.lead_id) : null;
    let offerId = lead?.offer_id || null;
    if (!offerId) {
      const { data: offers } = await supabase.from('offers').select('id').eq('is_active', true).eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1);
      offerId = offers?.[0]?.id || null;
    }
    if (!offerId) throw new Error('Aucune offre active. Crée une offre d\'abord.');
    const { data, error } = await supabase.functions.invoke('handle-booking', {
      body: {
        name: lead?.name || payload.contact_name || 'RDV',
        email: payload.contact_email || lead?.email || `rdv-${Date.now()}@placeholder.local`,
        phone: payload.contact_phone || lead?.phone || '+33000000000',
        booking_date: payload.date, time_slot: slot, offer_id: offerId,
        notes: payload.notes || 'Créé via assistant IA',
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast.success(`✅ RDV créé le ${payload.date} à ${slot}`);
  };

  const cancelAction = (msgId: string) => {
    updateMessage(msgId, (m) => ({ action: m.action ? { ...m.action, status: 'cancelled' } : undefined }));
  };

  const pickBookingSlot = async (msgId: string, slot: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.action || msg.action.payload.type !== 'booking') return;
    const newPayload: ActionPayload = { ...msg.action.payload, time_slot: slot };
    await confirmAction(msgId, newPayload);
  };

  const copyToClipboard = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copié !'); };
  const clearChat = () => { setMessages([]); abortRef.current?.abort(); };

  const handleToggleVoice = () => {
    if (!micSupported) { toast.error('Mode vocal non disponible.'); return; }
    if (isListening) { stopMic(); setVoiceMode(false); } else { setVoiceMode(false); toggleMic(); }
  };

  const displayText = isListening && interimText ? input + (input ? ' ' : '') + interimText : input;
  const isPending = thinking || isTranscribing;
  const isEmpty = messages.length === 0 && !thinking;

  return (
    <>
      <div
        className={cn("w-full relative rounded-xl transition-all", isDragging && "ring-2 ring-primary/50 bg-primary/5")}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/90 backdrop-blur-sm border-2 border-dashed border-primary">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Paperclip className="h-6 w-6" />
              <p className="text-sm font-medium">Déposez le fichier (CSV, Excel, PDF, image…)</p>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.txt,.png,.jpg,.jpeg,.webp" onChange={onPickFile} className="hidden" />

        {(attachedFileName || bulkLoading) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <FileText className="h-3 w-3 text-primary" />}
            <span className="flex-1 truncate text-foreground">{attachedFileName || 'Analyse en cours…'}</span>
            <span className="text-muted-foreground">{bulkLoading ? 'Analyse IA…' : 'Prêt'}</span>
          </div>
        )}

        {/* Chat header */}
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-medium text-foreground">Assistant IA</span>
          <span className="text-[10px] text-muted-foreground">· confirme avant chaque action</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Effacer
            </button>
          )}
        </div>

        {/* Chat thread */}
        {!isEmpty && (
          <div className="mb-3 max-h-[420px] overflow-y-auto custom-scrollbar space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
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
                  'max-w-[88%] rounded-2xl px-3 py-2 text-sm',
                  msg.role === 'user' ? 'bg-primary/15 text-foreground rounded-br-sm' : 'bg-muted/50 text-foreground rounded-bl-sm'
                )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-1.5 [&>ul]:mb-1.5 [&>ol]:mb-1.5 [&_code]:text-xs">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}

                  {msg.action && (
                    <ActionCard
                      payload={msg.action.payload}
                      status={msg.action.status}
                      onConfirm={(p) => confirmAction(msg.id, p)}
                      onCancel={() => cancelAction(msg.id)}
                      onPickSlot={(slot) => pickBookingSlot(msg.id, slot)}
                    />
                  )}

                  {msg.role === 'assistant' && msg.content && (
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

            {thinking && (
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

        {/* Quick suggestions when empty */}
        {isEmpty && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Voice mode visualizer */}
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
              <div className="mt-4 min-h-[40px] rounded-xl bg-muted/30 border border-border/30 px-4 py-3">
                {displayText ? (
                  <p className="text-sm text-foreground">
                    {input}
                    {interimText && <span className="text-muted-foreground/70 italic"> {interimText}</span>}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">Parlez, je vous écoute...</p>
                )}
              </div>
              <div className="mt-4 flex justify-center gap-3">
                <Button variant="outline" size="sm" onClick={handleToggleVoice} className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10">
                  <MicOff className="h-4 w-4 mr-1.5" /> Arrêter
                </Button>
                {input.trim() && (
                  <Button size="sm" onClick={(e) => handleSubmit(e as any)} className="rounded-full gradient-primary text-white" disabled={isPending}>
                    <Send className="h-4 w-4 mr-1.5" /> Envoyer
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-2">
          {isListening && <AudioVisualizer isListening={isListening} variant="inline" className="mb-1" />}

          <div className="flex gap-2 items-end">
            <motion.button
              type="button"
              onClick={handleToggleVoice}
              whileHover={micSupported ? { scale: 1.04 } : undefined}
              whileTap={micSupported ? { scale: 0.97 } : undefined}
              disabled={!micSupported || isTranscribing}
              aria-label={isListening ? 'Arrêter le mode vocal' : 'Activer le mode vocal'}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all duration-300',
                isListening
                  ? 'border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_15px_hsl(var(--destructive)/0.2)]'
                  : micSupported
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50'
                    : 'border-border/60 bg-muted/40 text-muted-foreground'
              )}
            >
              {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span className="hidden sm:inline">Vocal</span>
            </motion.button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkLoading}
              title="Joindre un fichier (CSV, Excel, PDF, image)"
              aria-label="Joindre un fichier"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30 px-3 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>

            <textarea
              ref={textareaRef}
              value={displayText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                isListening ? 'Parlez, je transcris en direct...'
                : isTranscribing ? 'Transcription en cours...'
                : 'Demande, modifie, crée — je confirme avant toute action…'
              }
              className="flex-1 min-w-0 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-all"
              style={{ maxHeight: '120px' }}
              disabled={isPending}
            />

            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="flex items-center gap-1 rounded-xl gradient-primary px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      {bulkRows && (
        <BulkImportPreview
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          rows={bulkRows}
          stats={bulkStats}
          onImported={() => { setBulkRows(null); setBulkStats(null); onDone?.(); }}
        />
      )}
    </>
  );
}
