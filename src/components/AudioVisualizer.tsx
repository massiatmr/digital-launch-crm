import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioVisualizerProps {
  isListening: boolean;
  className?: string;
}

export function AudioVisualizer({ isListening, className }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isListening) {
      cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      analyserRef.current = null;
      // Clear canvas
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
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        draw();
      } catch {
        // Microphone access denied — show idle animation
        drawIdle();
      }
    }

    function draw() {
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

        const barCount = 24;
        const gap = 2;
        const barWidth = (w - (barCount - 1) * gap) / barCount;
        const centerY = h / 2;

        // Get primary color from CSS
        const style = getComputedStyle(canvas!);
        const primaryColor = style.getPropertyValue('color') || 'hsl(150, 60%, 50%)';

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * bufferLength);
          const value = dataArray[dataIdx] / 255;
          const barHeight = Math.max(3, value * (h * 0.8));

          const x = i * (barWidth + gap);
          const radius = barWidth / 2;

          ctx!.fillStyle = primaryColor;
          ctx!.globalAlpha = 0.5 + value * 0.5;
          ctx!.beginPath();
          ctx!.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, radius);
          ctx!.fill();
        }
        ctx!.globalAlpha = 1;
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

        const barCount = 24;
        const gap = 2;
        const barWidth = (w - (barCount - 1) * gap) / barCount;
        const centerY = h / 2;

        const style = getComputedStyle(canvas!);
        const primaryColor = style.getPropertyValue('color') || 'hsl(150, 60%, 50%)';

        for (let i = 0; i < barCount; i++) {
          const value = 0.15 + 0.25 * Math.sin((frame * 0.04) + (i * 0.5));
          const barHeight = Math.max(3, value * (h * 0.6));

          const x = i * (barWidth + gap);
          const radius = barWidth / 2;

          ctx!.fillStyle = primaryColor;
          ctx!.globalAlpha = 0.4 + value * 0.4;
          ctx!.beginPath();
          ctx!.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, radius);
          ctx!.fill();
        }
        ctx!.globalAlpha = 1;
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
  }, [isListening]);

  if (!isListening) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2',
      className
    )}>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
      </span>
      <canvas
        ref={canvasRef}
        width={200}
        height={32}
        className="flex-1 text-primary"
        style={{ maxWidth: 200 }}
      />
      <span className="text-[10px] font-medium text-primary animate-pulse">Écoute...</span>
    </div>
  );
}
