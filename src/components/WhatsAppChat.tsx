import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CheckCircle2, AlertCircle, Clock, Mic, Square, Trash2, FileText, Lock, Paperclip, Download, X as XIcon, MessageCircle, Facebook, Instagram } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useWhatsAppMessages, useSendWhatsAppMessage, useSendWhatsAppAudio, useWhatsAppRealtime } from '@/hooks/useFollowupTasks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LiveAudioVisualizer } from '@/components/LiveAudioVisualizer';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { FollowupScriptsPicker } from '@/components/FollowupScriptsPicker';
import { TemplatePickerDialog } from '@/components/conversations/TemplatePickerDialog';
import { NextFollowupBanner } from '@/components/conversations/NextFollowupBanner';
import { AiStatusBanner } from '@/components/conversations/AiStatusBanner';
import { SuggestedReplies } from '@/components/conversations/SuggestedReplies';
import { useConvControls } from '@/hooks/useConversationControls';
import { Mp3Encoder } from 'lamejs';

type PendingMsg = { tempId: string; content: string; at: number; status: 'sending' | 'failed' };

function AudioBubble({ path, transcript, outbound }: { path: string | null; transcript: string | null; outbound?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    supabase.storage.from('wa-audio').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  return (
    <div className="space-y-1.5">
      {url ? (
        <VoiceMessagePlayer src={url} outbound={outbound} />
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Chargement audio…
        </div>
      )}
      {transcript && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-2">
          🎙️ {transcript}
        </p>
      )}
    </div>
  );
}

function MediaBubble({ path, mime, filename, caption }: { path: string; mime: string | null; filename: string | null; caption?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    supabase.storage.from('wa-media').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  const isImage = mime?.startsWith('image/');
  const isVideo = mime?.startsWith('video/');
  return (
    <div className="space-y-1.5">
      {!url ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Chargement…</div>
      ) : isImage ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={filename || 'image'} className="rounded-lg max-h-64 object-cover" />
        </a>
      ) : isVideo ? (
        <video src={url} controls className="rounded-lg max-h-64 max-w-full" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs underline">
          <Download className="h-3 w-3" /> {filename || 'Télécharger le document'}
        </a>
      )}
      {caption && <p className="text-sm whitespace-pre-line">{caption}</p>}
    </div>
  );
}

function mergeBuffers(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate >= inputSampleRate) return buffer;
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function encodeMp3FromFloat32(samples: Float32Array, sampleRate: number) {
  const targetRate = 16000;
  const mono = downsampleBuffer(samples, sampleRate, targetRate);
  const pcm = floatTo16BitPCM(mono);
  const encoder = new Mp3Encoder(1, targetRate, 64);
  const blockSize = 1152;
  const mp3Parts: BlobPart[] = [];

  for (let i = 0; i < pcm.length; i += blockSize) {
    const chunk = pcm.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) mp3Parts.push(new Uint8Array(encoded).slice().buffer);
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) mp3Parts.push(new Uint8Array(finalChunk).slice().buffer);

  return new Blob(mp3Parts, { type: 'audio/mpeg' });
}

export function WhatsAppChat({ leadId, leadName, className }: { leadId: string; leadName?: string; className?: string }) {
  useWhatsAppRealtime(leadId);
  const { data: messages = [] } = useWhatsAppMessages(leadId);
  const { data: ctl } = useConvControls(leadId);
  const sendWA = useSendWhatsAppMessage();
  const sendAudio = useSendWhatsAppAudio();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastIsInbound = messages.length > 0 && (messages[messages.length - 1] as any).direction === 'inbound';

  // Détecter le canal (whatsapp / messenger / instagram) depuis le dernier message
  const channel: 'whatsapp' | 'messenger' | 'instagram' = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const c = (messages[i] as any).channel;
      if (c === 'messenger' || c === 'instagram' || c === 'whatsapp') return c;
    }
    return 'whatsapp';
  }, [messages]);
  const isMeta = channel !== 'whatsapp';

  // Fenêtre 24h Meta : on ne peut envoyer du texte libre que si le lead a écrit dans les dernières 24h
  const isWithin24h = useMemo(() => {
    const lastInbound = (messages as any[])
      .filter((m) => m.direction === 'inbound')
      .reduce<number>((max, m) => Math.max(max, new Date(m.sent_at).getTime()), 0);
    if (!lastInbound) return false;
    return Date.now() - lastInbound < 24 * 60 * 60 * 1000;
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(44100);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending.length]);

  useEffect(() => {
    if (pending.length === 0) return;
    setPending((prev) =>
      prev.filter((p) => !messages.some((m: any) => m.direction === 'outbound' && m.content === p.content && new Date(m.sent_at).getTime() >= p.at - 5000))
    );
  }, [messages, pending.length]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg) return;
    if (!isMeta && !isWithin24h) {
      // WhatsApp hors fenêtre : on force l'usage d'un template
      toast.info('Hors fenêtre 24h : envoie un template approuvé.');
      setTemplateOpen(true);
      return;
    }
    setInput('');
    const tempId = `tmp-${Date.now()}`;
    setPending((p) => [...p, { tempId, content: msg, at: Date.now(), status: 'sending' }]);
    try {
      if (isMeta) {
        const fn = channel === 'instagram' ? 'send-instagram-message' : 'send-messenger-message';
        const { data, error } = await supabase.functions.invoke(fn, { body: { lead_id: leadId, message: msg } });
        if (error) throw error;
        if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
        toast.success('Message envoyé');
      } else {
        await sendWA.mutateAsync({ leadId, message: msg });
      }
    } catch (e: any) {
      setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'failed' } : x));
      const txt = (e?.message || '').toString();
      if (!isMeta && /131047|131051|24 hours|messaging window/i.test(txt)) {
        toast.error('Fenêtre 24h fermée — utilise un template.');
        setTemplateOpen(true);
      } else if (isMeta) {
        toast.error('Envoi échoué : ' + (txt || 'erreur'));
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      sampleRateRef.current = ctx.sampleRate;
      audioChunksRef.current = [];

      source.connect(processor);
      processor.connect(ctx.destination);
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(inputData));
      };

      audioContextRef.current = ctx;
      sourceRef.current = source;
      processorRef.current = processor;
      recorderRef.current = null;
      setActiveStream(stream);
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error('Micro inaccessible : ' + (e?.message || 'permission refusée'));
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    activeStream?.getTracks().forEach((t) => t.stop());
    setActiveStream(null);

    const samples = mergeBuffers(audioChunksRef.current);
    const blob = encodeMp3FromFloat32(samples, sampleRateRef.current);
    setRecordedBlob(blob);
    setRecordedUrl(URL.createObjectURL(blob));

    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    audioChunksRef.current = [];
  };

  const cancelRecording = () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioContextRef.current?.close().catch(() => undefined);
    activeStream?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setRecordedBlob(null);
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    setElapsed(0);
    setActiveStream(null);
    audioContextRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    audioChunksRef.current = [];
  };

  const sendRecording = async () => {
    if (!recordedBlob) return;
    const buf = await recordedBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    try {
      await sendAudio.mutateAsync({ leadId, audioBase64: b64, mimeType: recordedBlob.type || 'audio/mpeg' });
      cancelRecording();
    } catch { /* toast géré dans le hook */ }
  };

  const isAudio = (m: any) => !!m.media_storage_path && (m.media_type?.startsWith('audio') || m.content === '[Vocal]');
  const isMedia = (m: any) => !!m.media_storage_path && !isAudio(m);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [fileCaption, setFileCaption] = useState('');
  const [sendingMedia, setSendingMedia] = useState(false);

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 16 * 1024 * 1024) { toast.error('Fichier trop lourd (max 16 Mo)'); return; }
    const previewUrl = f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : null;
    setPendingFile({ file: f, previewUrl });
    setFileCaption('');
  };

  const sendMedia = async () => {
    if (!pendingFile) return;
    setSendingMedia(true);
    try {
      const buf = await pendingFile.file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const { error } = await supabase.functions.invoke('send-whatsapp-media', {
        body: { lead_id: leadId, media_base64: b64, mime_type: pendingFile.file.type || 'application/octet-stream', filename: pendingFile.file.name, caption: fileCaption || undefined },
      });
      if (error) throw error;
      if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setFileCaption('');
    } catch (e: any) {
      toast.error('Envoi échoué : ' + (e?.message || 'erreur'));
    } finally {
      setSendingMedia(false);
    }
  };

  return (
    <div className={cn('rounded-xl border border-border bg-muted/10 flex flex-col', className)}>
      <div className="p-2"><AiStatusBanner leadId={leadId} /></div>
      <NextFollowupBanner leadId={leadId} paused={!!ctl?.automation_paused_at} />
      <div className="flex-1 min-h-[200px] overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun message. Écris ci-dessous pour démarrer.</p>
        ) : (
          <>
            {messages.map((m: any) => (
              <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                  m.direction === 'outbound' ? 'bg-primary/20 rounded-br-sm' : 'bg-card rounded-bl-sm border border-border')}>
                  {isAudio(m) ? (
                    <AudioBubble path={m.media_storage_path} transcript={m.transcript} outbound={m.direction === 'outbound'} />
                  ) : isMedia(m) ? (
                    <MediaBubble path={m.media_storage_path} mime={m.media_type} filename={m.media_filename} caption={m.content && !['[Photo]','[Vidéo]','[Document]'].includes(m.content) ? m.content : null} />
                  ) : (
                    <p className="whitespace-pre-line">{m.content}</p>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {format(new Date(m.sent_at), 'HH:mm', { locale: fr })}
                    {m.direction === 'outbound' && m.status === 'dry_run' && <span className="text-amber-500">· dry-run</span>}
                    {m.direction === 'outbound' && m.status === 'sent' && <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />}
                    {m.direction === 'outbound' && m.status === 'failed' && <AlertCircle className="h-2.5 w-2.5 text-destructive" />}
                  </div>
                </div>
              </div>
            ))}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end">
                <div className={cn('max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-sm',
                  p.status === 'failed' ? 'bg-destructive/20' : 'bg-primary/10 opacity-70')}>
                  <p className="whitespace-pre-line">{p.content}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {p.status === 'sending' ? (<><Clock className="h-2.5 w-2.5" /> envoi…</>) : (<><AlertCircle className="h-2.5 w-2.5 text-destructive" /> échec</>)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Preview vocal enregistré */}
      {recordedUrl && !recording && (
        <div className="border-t border-border p-2 flex items-center gap-2 bg-muted/20">
          <div className="flex-1 min-w-0 rounded-xl bg-card border border-border px-2">
            <VoiceMessagePlayer src={recordedUrl} outbound />
          </div>
          <Button size="icon" variant="ghost" onClick={cancelRecording} title="Annuler">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <Button size="icon" onClick={sendRecording} disabled={sendAudio.isPending}>
            {sendAudio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* Enregistrement en cours */}
      {recording && (
        <div className="border-t border-border p-2 flex items-center gap-2 bg-destructive/10">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="text-sm font-mono shrink-0 tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          <LiveAudioVisualizer stream={activeStream} />
          <Button size="icon" variant="ghost" onClick={cancelRecording} title="Annuler" className="shrink-0">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <Button size="icon" onClick={stopRecording} title="Arrêter" className="shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Input texte */}
      {!recording && !recordedUrl && (
        <>
          {!isWithin24h && messages.length > 0 && !isMeta && (
            <div className="border-t border-border bg-amber-500/10 px-3 py-2 flex items-center gap-2 text-xs text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Hors fenêtre 24h Meta — seuls les templates approuvés peuvent être envoyés.</span>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setTemplateOpen(true)}>
                <FileText className="h-3 w-3 mr-1" /> Template
              </Button>
            </div>
          )}
          {!isWithin24h && messages.length > 0 && isMeta && (
            <div className="border-t border-border bg-amber-500/10 px-3 py-2 flex items-center gap-2 text-xs text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Hors fenêtre 24h {channel === 'instagram' ? 'Instagram' : 'Messenger'} — il faut attendre une nouvelle réponse du lead pour envoyer un message.</span>
            </div>
          )}
          {!isWithin24h && messages.length === 0 && !isMeta && (
            <div className="border-t border-border bg-primary/10 px-3 py-2 flex items-center gap-2 text-xs text-primary-foreground/90">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1">Premier message : utilise un template approuvé pour démarrer la conversation.</span>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setTemplateOpen(true)}>
                Choisir un template
              </Button>
            </div>
          )}
          <SuggestedReplies
            leadId={leadId}
            enabled={isWithin24h && lastIsInbound}
            onPick={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => { onPickFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
          />
          {pendingFile && (
            <div className="border-t border-border bg-muted/20 p-2 flex items-start gap-2">
              {pendingFile.previewUrl && pendingFile.file.type.startsWith('image/') ? (
                <img src={pendingFile.previewUrl} className="h-16 w-16 rounded object-cover" />
              ) : pendingFile.previewUrl && pendingFile.file.type.startsWith('video/') ? (
                <video src={pendingFile.previewUrl} className="h-16 w-16 rounded object-cover" />
              ) : (
                <div className="h-16 w-16 rounded bg-card border border-border flex items-center justify-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs truncate">{pendingFile.file.name}</p>
                <Textarea
                  value={fileCaption}
                  onChange={(e) => setFileCaption(e.target.value)}
                  placeholder="Légende (optionnel)"
                  rows={1}
                  className="min-h-[32px] text-xs"
                />
              </div>
              <Button size="icon" variant="ghost" onClick={() => { if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); }}>
                <XIcon className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={sendMedia} disabled={sendingMedia}>
                {sendingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <div className="border-t border-border p-2 flex items-end gap-2">
            <FollowupScriptsPicker
              leadName={leadName}
              onInsert={(text) => setInput((cur) => cur ? `${cur}\n\n${text}` : text)}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isWithin24h || isMeta}
              className="shrink-0"
              title={isMeta ? 'Pièce jointe non disponible sur ce canal' : (isWithin24h ? 'Joindre un fichier' : 'Hors fenêtre 24h')}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={
                isMeta
                  ? (isWithin24h ? `Réponds via ${channel === 'instagram' ? 'Instagram' : 'Messenger'}…` : 'Hors fenêtre 24h — attends une réponse du lead')
                  : (isWithin24h ? 'Écris un message... (Entrée pour envoyer)' : 'Hors fenêtre 24h — utilise un template')
              }
              disabled={isMeta && !isWithin24h}
              rows={1}
              className="min-h-[40px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0 py-2 leading-snug overflow-y-auto"
            />
            {input.trim() ? (
              <Button size="icon" onClick={handleSend} disabled={sendWA.isPending} className="shrink-0">
                {sendWA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : isWithin24h && !isMeta ? (
              <Button size="icon" variant="secondary" onClick={startRecording} className="shrink-0" title="Enregistrer un vocal">
                <Mic className="h-4 w-4" />
              </Button>
            ) : !isMeta ? (
              <Button size="icon" variant="secondary" onClick={() => setTemplateOpen(true)} className="shrink-0" title="Envoyer un template">
                <FileText className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </>
      )}

      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        leadId={leadId}
      />
    </div>
  );
}
