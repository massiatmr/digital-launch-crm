import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Singleton: un seul lecteur actif à la fois
let currentlyPlaying: HTMLAudioElement | null = null;

const BAR_COUNT = 28;
// Pseudo-waveform stable (déterministe par message via la longueur de l'URL pour un look "vivant")
const seededBars = (seed: number) => {
  const arr: number[] = [];
  let s = seed || 1;
  for (let i = 0; i < BAR_COUNT; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    arr.push(0.3 + r * 0.7); // 0.3 → 1
  }
  return arr;
};

function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceMessagePlayer({
  src,
  outbound = false,
  className,
}: {
  src: string;
  outbound?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState(false);

  const bars = useRef(seededBars(src.length * 7)).current;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      setIsLoading(false);
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrent(0);
      audio.currentTime = 0;
      if (currentlyPlaying === audio) currentlyPlaying = null;
    };
    const onErr = () => { setError(true); setIsLoading(false); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('canplay', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErr);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('canplay', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onErr);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      if (currentlyPlaying === audio) currentlyPlaying = null;
      audioRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (isPlaying) {
      audio.pause();
      return;
    }
    if (currentlyPlaying && currentlyPlaying !== audio) {
      currentlyPlaying.pause();
    }
    try {
      await audio.play();
      currentlyPlaying = audio;
    } catch {
      setError(true);
    }
  }, [isPlaying, error]);

  const seekFromEvent = useCallback((clientX: number) => {
    const el = barsContainerRef.current;
    const audio = audioRef.current;
    if (!el || !audio || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  }, [duration]);

  const progress = duration > 0 ? current / duration : 0;
  const displayTime = isPlaying || current > 0 ? current : duration;

  return (
    <div
      className={cn(
        'flex items-center gap-3 min-w-[220px] max-w-[280px] py-1',
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={isLoading || error}
        className={cn(
          'shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all',
          'shadow-sm active:scale-95',
          outbound
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-foreground/10 text-foreground hover:bg-foreground/20',
          error && 'opacity-50 cursor-not-allowed'
        )}
        aria-label={isPlaying ? 'Pause' : 'Lire'}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          ref={barsContainerRef}
          onClick={(e) => seekFromEvent(e.clientX)}
          className="flex items-center gap-[2px] h-7 cursor-pointer"
          role="slider"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {bars.map((h, i) => {
            const filled = i / BAR_COUNT <= progress;
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  filled
                    ? outbound ? 'bg-primary' : 'bg-foreground/80'
                    : outbound ? 'bg-primary/30' : 'bg-foreground/25'
                )}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground leading-none">
          {error ? 'Erreur audio' : formatTime(displayTime)}
        </span>
      </div>
    </div>
  );
}
