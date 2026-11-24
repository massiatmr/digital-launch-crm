import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { Mic, Square, Pause, Play, Loader2, Trash2, ChevronDown, RotateCw, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isVoiceFrame, toneBandRatio, SILENCE_HANGOVER_MS } from '@/lib/voiceGate';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const MAX_MS = 60 * 60 * 1000;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function CallRecorderButton({ leadId, onBusyChange }: { leadId: string; onBusyChange?: (busy: boolean) => void }) {
  const wsId = useCurrentWorkspaceId();
  const qc = useQueryClient();
  const [lang, setLang] = useState<string>(() => localStorage.getItem('call_rec_lang') || 'darija');
  const [state, setState] = useState<'idle' | 'rec' | 'paused' | 'uploading'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [speech, setSpeech] = useState(0);
  const [talking, setTalking] = useState(false);
  const [level, setLevel] = useState(0);
  const r = useRef<any>({});
  const canSystem = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !/Mobi|Android|iPhone/i.test(navigator.userAgent);

  const finishRef = useRef<() => void>();
  // Si le formulaire se ferme pendant l'enregistrement, on sauvegarde l'appel au lieu de le perdre.
  useEffect(() => () => {
    const x = r.current;
    if (x.rec && !x.finishing && x.rec.state !== 'inactive') finishRef.current?.();
    else stopAll();
  }, []);
  useEffect(() => {
    onBusyChange?.(state !== 'idle');
    if (state === 'idle') return;
    // Fermer l'onglet ou recharger pendant un appel perdrait l'enregistrement : on demande confirmation.
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  function stopAll() {
    const x = r.current;
    clearInterval(x.timer);
    x.streams?.forEach((s: MediaStream) => s.getTracks().forEach((t) => t.stop()));
    x.ctx?.close?.().catch(() => {});
  }

  async function start(withSystem: boolean) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const streams = [mic];
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (withSystem) {
        const disp = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        disp.getVideoTracks().forEach((t) => t.stop());
        if (!disp.getAudioTracks().length) toast.warning("Aucun son d'ordinateur partagé — coche « Partager l'audio »");
        else { ctx.createMediaStreamSource(new MediaStream(disp.getAudioTracks())).connect(dest); streams.push(disp); }
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(dest.stream).connect(analyser);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(1000);
      rec.pause(); // on ne démarre qu'à la première voix
      const td = new Float32Array(analyser.fftSize);
      const fd = new Uint8Array(analyser.frequencyBinCount);
      let lastVoice = 0, t0 = Date.now(), speechMs = 0, last = Date.now();
      r.current = { rec, chunks, streams, ctx, mime: mime || 'audio/webm', manualPause: false, t0 };
      r.current.timer = setInterval(() => {
        const now = Date.now();
        const x = r.current;
        if (x.manualPause) { last = now; return; }
        analyser.getFloatTimeDomainData(td);
        analyser.getByteFrequencyData(fd);
        let sum = 0; for (const v of td) sum += v * v;
        const voice = isVoiceFrame(Math.sqrt(sum / td.length), toneBandRatio(fd, ctx.sampleRate, analyser.fftSize));
        if (voice) lastVoice = now;
        const keep = now - lastVoice < SILENCE_HANGOVER_MS;
        if (keep && rec.state === 'paused') rec.resume();
        if (!keep && rec.state === 'recording') rec.pause();
        if (rec.state === 'recording') speechMs += now - last;
        last = now;
        setLevel(Math.min(1, Math.sqrt(sum / td.length) * 8));
        setTalking(voice);
        setElapsed((now - t0) / 1000);
        setSpeech(speechMs / 1000);
        r.current.speechMs = speechMs;
        if (now - t0 > MAX_MS) { toast.info('Limite de 60 min atteinte'); finish(); }
      }, 100);
      setState('rec');
      toast.message("Prévenez le prospect que l'appel est enregistré.");
    } catch (e: any) {
      stopAll();
      toast.error(e?.name === 'NotAllowedError' ? 'Accès au micro refusé' : "Impossible de démarrer l'enregistrement");
    }
  }

  function togglePause() {
    const x = r.current;
    x.manualPause = !x.manualPause;
    if (x.manualPause && x.rec.state === 'recording') x.rec.pause();
    setState(x.manualPause ? 'paused' : 'rec');
  }

  finishRef.current = () => { void finish(); };
  async function finish() {
    const x = r.current;
    if (!x.rec || x.finishing) return;
    x.finishing = true;
    clearInterval(x.timer);
    setState('uploading');
    if (x.rec.state === 'paused') x.rec.resume();
    await new Promise<void>((res) => { x.rec.onstop = () => res(); x.rec.stop(); });
    stopAll();
    const totalS = Math.round((Date.now() - x.t0) / 1000);
    const speechS = Math.round((x.speechMs || 0) / 1000);
    const blob = new Blob(x.chunks, { type: x.mime.split(';')[0] });
    try {
      if (speechS < 2 || blob.size < 2000) { toast.warning('Aucune voix détectée, rien enregistré'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ws } = wsId ? await supabase.from('workspaces').select('call_audio_retention_days').eq('id', wsId).maybeSingle() : { data: null };
      const days = (ws as any)?.call_audio_retention_days ?? 90;
      const id = crypto.randomUUID();
      const path = `${leadId}/${id}.${x.mime.includes('mp4') ? 'm4a' : 'webm'}`;
      const up = await supabase.storage.from('call-recordings').upload(path, blob, { contentType: blob.type });
      if (up.error) throw up.error;
      const { data: act } = await supabase.from('lead_activities').insert({
        lead_id: leadId, activity_type: 'call', description: `📞 Appel enregistré (${fmt(speechS)} de voix) — transcription en cours…`,
        ...(wsId ? { workspace_id: wsId } : {}),
      } as any).select('id').single();
      const { error } = await supabase.from('call_recordings').insert({
        id, lead_id: leadId, workspace_id: wsId, user_id: user!.id, storage_path: path, mime_type: blob.type,
        duration_speech_s: speechS, duration_total_s: totalS, size_bytes: blob.size, language: lang,
        activity_id: (act as any)?.id ?? null, audio_expires_at: new Date(Date.now() + days * 864e5).toISOString(),
      } as any);
      if (error) throw error;
      toast.success(`Appel enregistré (${(blob.size / 1024 / 1024).toFixed(1)} Mo)`);
      qc.invalidateQueries({ queryKey: ['call_recordings', leadId] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      supabase.functions.invoke('transcribe-call', { body: { recording_id: id } }).then(({ error }) => {
        if (error) toast.error('Transcription échouée, tu peux réessayer');
        qc.invalidateQueries({ queryKey: ['call_recordings', leadId] });
        qc.invalidateQueries({ queryKey: ['activities'] });
      });
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'envoi de l'enregistrement");
    } finally {
      r.current = {};
      setLevel(0);
      setState('idle'); setElapsed(0); setSpeech(0);
    }
  }

  if (state === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => start(false)} variant="destructive" className="h-11 flex-1 min-w-[180px] gap-2 text-base">
          <Mic className="h-5 w-5" /> Enregistrer l'appel
        </Button>
        {canSystem && (
          <Button onClick={() => start(true)} variant="outline" className="h-11 gap-2" title="Capte aussi le son de l'ordinateur (WhatsApp Desktop, Meet…)">
            <Monitor className="h-4 w-4" /> + son PC
          </Button>
        )}
        <Select value={lang} onValueChange={(v) => { setLang(v); localStorage.setItem('call_rec_lang', v); }}>
          <SelectTrigger className="h-11 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="darija">Darija (AR + FR)</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className={cn('h-3 w-3 rounded-full bg-destructive', state === 'rec' && 'animate-pulse')} />
        <span className="font-mono text-lg">{fmt(elapsed)}</span>
        <span className="text-xs text-muted-foreground">voix gardée : <span className="font-mono">{fmt(speech)}</span></span>
        <span className={cn('ml-auto text-xs', talking ? 'text-primary' : 'text-muted-foreground')}>
          {state === 'uploading' ? 'Envoi…' : state === 'paused' ? 'En pause' : talking ? '● Voix' : 'Silence (ignoré)'}
        </span>
      </div>
      <div className="flex items-end gap-0.5 h-8" aria-label="Niveau du micro">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className={cn('flex-1 rounded-sm transition-all duration-100', level * 24 > i ? (i > 19 ? 'bg-destructive' : 'bg-primary') : 'bg-muted')}
            style={{ height: `${30 + (i / 24) * 70}%` }} />
        ))}
      </div>
      {state === 'rec' && level < 0.02 && <p className="text-xs text-muted-foreground">Le micro ne capte rien — parle ou vérifie le micro choisi.</p>}
      <div className="flex gap-2">
        <Button onClick={togglePause} variant="outline" className="h-11 flex-1 gap-2" disabled={state === 'uploading'}>
          {state === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{state === 'paused' ? 'Reprendre' : 'Pause'}
        </Button>
        <Button onClick={finish} variant="destructive" className="h-11 flex-1 gap-2" disabled={state === 'uploading'}>
          {state === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Terminer
        </Button>
      </div>
    </div>
  );
}

function RecordingCard({ rec, leadId, onDeleted }: { rec: any; leadId: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = rec.summary as any;

  async function load() {
    if (!rec.storage_path) return;
    const { data } = await supabase.storage.from('call-recordings').createSignedUrl(rec.storage_path, 3600);
    setUrl(data?.signedUrl ?? null);
  }
  useEffect(() => { load(); }, [rec.storage_path]);
  async function retry() {
    setBusy(true);
    const { error } = await supabase.functions.invoke('transcribe-call', { body: { recording_id: rec.id } });
    setBusy(false);
    if (error) toast.error('Transcription échouée');
    qc.invalidateQueries({ queryKey: ['call_recordings', leadId] });
  }
  async function remove() {
    if (!confirm('Supprimer cet enregistrement ?')) return;
    if (rec.storage_path) await supabase.storage.from('call-recordings').remove([rec.storage_path]);
    const { error } = await supabase.from('call_recordings').delete().eq('id', rec.id);
    if (error) toast.error('Suppression impossible'); else { qc.invalidateQueries({ queryKey: ['call_recordings', leadId] }); onDeleted?.(); }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">📞 {fmt(rec.duration_speech_s)} de voix</span>
        <span className="text-[10px] text-muted-foreground font-mono">{(rec.size_bytes / 1024 / 1024).toFixed(1)} Mo · {formatDistanceToNow(new Date(rec.created_at), { addSuffix: true, locale: fr })}</span>
        {s?.score && <span className="text-xs">{s.score === 'hot' ? '🔥' : s.score === 'warm' ? '🌤' : '❄️'}</span>}
        <button onClick={remove} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
      </div>
      {rec.storage_path ? (url ? <audio src={url} controls className="w-full h-10" /> :
        <Button variant="outline" size="sm" onClick={load}><Play className="h-3.5 w-3.5 mr-1" /> Écouter</Button>)
        : <p className="text-xs text-muted-foreground">Audio supprimé (durée de conservation dépassée), texte conservé.</p>}
      {rec.status === 'transcribing' || rec.status === 'uploaded' ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Transcription en cours…</p>
      ) : rec.status === 'failed' ? (
        <div className="flex items-center gap-2 text-xs text-destructive">{rec.error || 'Échec'}
          {rec.storage_path && <Button size="sm" variant="ghost" onClick={retry} disabled={busy}><RotateCw className={cn('h-3 w-3 mr-1', busy && 'animate-spin')} />Réessayer</Button>}
        </div>
      ) : null}
      {s && (
        <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Résumé</p>
          <p className="text-foreground">{s.resume}</p>
          {s.besoin && <p><b>Besoin :</b> {s.besoin}</p>}
          {s.objections?.length > 0 && <p><b>Objections :</b> {s.objections.join(' · ')}</p>}
          {s.prochaine_etape && <p><b>Prochaine étape :</b> {s.prochaine_etape}</p>}
        </div>
      )}
      {rec.transcript && (
        <div>
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /> Transcription complète
          </button>
          {open && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground max-h-[40vh] rounded-lg border border-border/50 bg-background/40 p-3 overflow-y-auto" dir="auto">{rec.transcript}</p>}
        </div>
      )}
    </div>
  );
}

export function useCallRecordings(leadId: string) {
  return useQuery({
    queryKey: ['call_recordings', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_recordings').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: (q) => ((q.state.data as any[] | undefined)?.some((r) => r.status === 'transcribing' || r.status === 'uploaded') ? 4000 : false),
  });
}

export function CallRecordingDialog({ rec, leadId, onClose }: { rec: any | null; leadId: string; onClose: () => void }) {
  return (
    <Dialog open={!!rec} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Appel enregistré</DialogTitle></DialogHeader>
        {rec && <RecordingCard rec={rec} leadId={leadId} onDeleted={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
