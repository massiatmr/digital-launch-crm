import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CheckCircle2, AlertCircle, Clock, Mic, Square, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useWhatsAppMessages, useSendWhatsAppMessage, useSendWhatsAppAudio, useWhatsAppRealtime } from '@/hooks/useFollowupTasks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LiveAudioVisualizer } from '@/components/LiveAudioVisualizer';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';

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

export function WhatsAppChat({ leadId, className }: { leadId: string; className?: string }) {
  useWhatsAppRealtime(leadId);
  const { data: messages = [] } = useWhatsAppMessages(leadId);
  const sendWA = useSendWhatsAppMessage();
  const sendAudio = useSendWhatsAppAudio();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
    setInput('');
    const tempId = `tmp-${Date.now()}`;
    setPending((p) => [...p, { tempId, content: msg, at: Date.now(), status: 'sending' }]);
    try {
      await sendWA.mutateAsync({ leadId, message: msg });
    } catch {
      setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'failed' } : x));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Préférer ogg/opus (compatible WhatsApp natif), sinon fallback webm/opus
      const preferred = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        setActiveStream(null);
      };
      mr.start();
      recorderRef.current = mr;
      setActiveStream(stream);
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error('Micro inaccessible : ' + (e?.message || 'permission refusée'));
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const cancelRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setRecordedBlob(null);
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    setElapsed(0);
  };

  const sendRecording = async () => {
    if (!recordedBlob) return;
    const buf = await recordedBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    try {
      await sendAudio.mutateAsync({ leadId, audioBase64: b64, mimeType: recordedBlob.type || 'audio/webm' });
      cancelRecording();
    } catch { /* toast géré dans le hook */ }
  };

  const isAudio = (m: any) => !!m.media_storage_path && (m.media_type?.startsWith('audio') || m.content === '[Vocal]');

  return (
    <div className={cn('rounded-xl border border-border bg-muted/10 flex flex-col', className)}>
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
                    <AudioBubble path={m.media_storage_path} transcript={m.transcript} />
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
          <audio controls src={recordedUrl} className="flex-1 h-9" />
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
        <div className="border-t border-border p-2 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Écris un message... (Entrée pour envoyer)"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0"
          />
          {input.trim() ? (
            <Button size="icon" onClick={handleSend} disabled={sendWA.isPending} className="shrink-0">
              {sendWA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          ) : (
            <Button size="icon" variant="secondary" onClick={startRecording} className="shrink-0" title="Enregistrer un vocal">
              <Mic className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
