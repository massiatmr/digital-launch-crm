import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Mic } from 'lucide-react';

interface AudioVisualizerProps {
  isListening: boolean;
  className?: string;
  variant?: 'inline' | 'orbital';
}

export function AudioVisualizer({ isListening, className, variant = 'inline' }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!isListening) {
      cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      setVolume(0);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = variant === 'orbital' ? 128 : 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;

        if (variant === 'orbital') drawOrbital();
        else drawInline();
      } catch {
        drawIdle();
      }
    }

    function drawInline() {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if (!canvas || !analyser || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function animate() {
        if (cancelled) return;
        animationRef.current = requestAnimationFrame(animate);
        analyser!.getByteFrequencyData(dataArray);

        const w = canvas!.width;
        const h = canvas!.height;
        ctx!.clearRect(0, 0, w, h);

        const barCount = 32;
        const gap = 2;
        const barWidth = (w - (barCount - 1) * gap) / barCount;
        const centerY = h / 2;

        // Compute average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        setVolume(sum / bufferLength / 255);

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * bufferLength);
          const value = dataArray[dataIdx] / 255;
          const barHeight = Math.max(3, value * (h * 0.85));

          const x = i * (barWidth + gap);
          const radius = barWidth / 2;

          // Gradient color from primary to accent
          const hue = 260 + (i / barCount) * 40;
          ctx!.fillStyle = `hsla(${hue}, 80%, 65%, ${0.5 + value * 0.5})`;
          ctx!.beginPath();
          ctx!.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, radius);
          ctx!.fill();
        }
      }
      animate();
    }

    function drawOrbital() {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if (!canvas || !analyser || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let frame = 0;

      function animate() {
        if (cancelled) return;
        animationRef.current = requestAnimationFrame(animate);
        analyser!.getByteFrequencyData(dataArray);
        frame++;

        const w = canvas!.width;
        const h = canvas!.height;
        ctx!.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const baseRadius = Math.min(w, h) * 0.28;

        // Compute average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avgVol = sum / bufferLength / 255;
        setVolume(avgVol);

        // Draw orbital rings
        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          const ringRadius = baseRadius + r * 12 + avgVol * 20;
          const segments = 48;
          const rotation = frame * 0.008 * (r % 2 === 0 ? 1 : -1);

          ctx!.beginPath();
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2 + rotation;
            const dataIdx = Math.floor((i / segments) * bufferLength);
            const value = dataArray[dataIdx] / 255;
            const dist = ringRadius + value * 25;

            const x = cx + Math.cos(angle) * dist;
            const y = cy + Math.sin(angle) * dist;
            if (i === 0) ctx!.moveTo(x, y);
            else ctx!.lineTo(x, y);
          }
          ctx!.closePath();
          const alpha = 0.3 + avgVol * 0.5 - r * 0.08;
          const hue = 260 + r * 30;
          ctx!.strokeStyle = `hsla(${hue}, 80%, 65%, ${Math.max(0.1, alpha)})`;
          ctx!.lineWidth = 2 - r * 0.3;
          ctx!.stroke();
        }

        // Inner glow circle
        const gradient = ctx!.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.7);
        gradient.addColorStop(0, `hsla(270, 80%, 65%, ${0.15 + avgVol * 0.25})`);
        gradient.addColorStop(1, 'hsla(270, 80%, 65%, 0)');
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(cx, cy, baseRadius * 0.7, 0, Math.PI * 2);
        ctx!.fill();
      }
      animate();
    }

    function drawIdle() {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let frame = 0;
      function animate() {
        if (cancelled) return;
        animationRef.current = requestAnimationFrame(animate);
        frame++;

        const w = canvas!.width;
        const h = canvas!.height;
        ctx!.clearRect(0, 0, w, h);

        if (variant === 'orbital') {
          const cx = w / 2;
          const cy = h / 2;
          const baseRadius = Math.min(w, h) * 0.28;

          for (let r = 0; r < 3; r++) {
            const pulse = Math.sin(frame * 0.02 + r) * 5;
            const ringRadius = baseRadius + r * 10 + pulse;
            ctx!.beginPath();
            ctx!.arc(cx, cy, ringRadius, 0, Math.PI * 2);
            ctx!.strokeStyle = `hsla(270, 80%, 65%, ${0.15 - r * 0.03})`;
            ctx!.lineWidth = 1.5;
            ctx!.stroke();
          }
        } else {
          const barCount = 32;
          const gap = 2;
          const barWidth = (w - (barCount - 1) * gap) / barCount;
          const centerY = h / 2;

          for (let i = 0; i < barCount; i++) {
            const value = 0.1 + 0.15 * Math.sin(frame * 0.03 + i * 0.4);
            const barHeight = Math.max(3, value * h * 0.5);
            const x = i * (barWidth + gap);
            const hue = 260 + (i / barCount) * 40;
            ctx!.fillStyle = `hsla(${hue}, 70%, 60%, ${0.3 + value * 0.3})`;
            ctx!.beginPath();
            ctx!.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, barWidth / 2);
            ctx!.fill();
          }
        }
      }
      animate();
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [isListening, variant]);

  if (!isListening) return null;

  if (variant === 'orbital') {
    return (
      <div className={cn('flex flex-col items-center gap-3', className)}>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={200}
            height={200}
            className="text-primary"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "flex items-center justify-center rounded-full w-16 h-16 transition-all duration-300",
              "bg-primary/10 border border-primary/20",
              volume > 0.3 && "scale-110 bg-primary/20 border-primary/40"
            )}>
              <Mic className={cn(
                "h-6 w-6 text-primary transition-all duration-200",
                volume > 0.3 && "scale-110"
              )} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <span className="text-xs font-medium text-primary/80 animate-pulse">Écoute en cours...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2',
      className
    )}>
      <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
      </span>
      <canvas
        ref={canvasRef}
        width={240}
        height={36}
        className="flex-1 text-primary"
        style={{ maxWidth: 240 }}
      />
      <span className="text-[10px] font-medium text-primary/80 animate-pulse">Écoute...</span>
    </div>
  );
}
