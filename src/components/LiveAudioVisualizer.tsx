import { useEffect, useRef } from 'react';

/**
 * Visualiseur live des barres de volume du micro pendant l'enregistrement.
 * Utilise Web Audio API + AnalyserNode pour réagir en temps réel à la voix.
 */
export function LiveAudioVisualizer({ stream, bars = 24 }: { stream: MediaStream | null; bars?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !containerRef.current) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioCtx();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const barEls = Array.from(containerRef.current.children) as HTMLDivElement[];

    const render = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < barEls.length; i++) {
        const idx = Math.floor((i / barEls.length) * data.length);
        const v = data[idx] / 255; // 0 → 1
        const h = Math.max(8, v * 100); // % de hauteur
        barEls[i].style.height = `${h}%`;
        barEls[i].style.opacity = `${0.4 + v * 0.6}`;
      }
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch {}
      try { ctx.close(); } catch {}
    };
  }, [stream]);

  return (
    <div ref={containerRef} className="flex items-center gap-[2px] h-8 flex-1 min-w-0">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-full bg-destructive transition-[height] duration-75 ease-out"
          style={{ height: '8%' }}
        />
      ))}
    </div>
  );
}
