import { useEffect, useRef } from 'react';

interface VisualizerCanvasProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  isSynthOrCors: boolean;
}

export function VisualizerCanvas({ analyser, isPlaying, isSynthOrCors }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const barCount = 28;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(100, Math.floor(rect.width * dpr));
      const targetH = Math.max(32, Math.floor(rect.height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.clearRect(0, 0, targetW, targetH);

      const styles = getComputedStyle(document.documentElement);
      const fgColor = styles.getPropertyValue('--color-foreground').trim() || '#262320';
      const primaryColor = styles.getPropertyValue('--color-primary').trim() || '#C8522E';

      const gap = 3 * dpr;
      const barWidth = Math.max(2 * dpr, (targetW - (barCount - 1) * gap) / barCount);

      let hasRealEnergy = false;
      if (analyser && dataArray && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        for (let i = 0; i < Math.min(barCount, dataArray.length); i++) {
          if (dataArray[i] > 2) {
            hasRealEnergy = true;
            break;
          }
        }
      }

      const now = performance.now() * 0.005;
      for (let i = 0; i < barCount; i++) {
        let ratio = 0.08;
        if (isPlaying) {
          if (hasRealEnergy && dataArray) {
            const binIndex = Math.min(dataArray.length - 1, Math.floor((i / barCount) * dataArray.length * 0.75));
            ratio = Math.max(0.1, dataArray[binIndex] / 255);
          } else if (!isSynthOrCors || isPlaying) {
            // Smooth harmonic wave when remote stream lacks CORS headers
            const wave =
              Math.sin(now + i * 0.42) * 0.28 +
              Math.cos(now * 0.7 - i * 0.25) * 0.22 +
              0.42;
            ratio = Math.max(0.12, Math.min(0.88, wave));
          }
        }

        const barH = Math.max(3 * dpr, ratio * targetH * 0.86);
        const x = i * (barWidth + gap);
        const y = (targetH - barH) / 2;

        ctx.fillStyle = isPlaying && ratio > 0.62 ? primaryColor : fgColor;
        ctx.globalAlpha = isPlaying ? 0.78 : 0.2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 2 * dpr);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (isPlaying) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [analyser, isPlaying, isSynthOrCors]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-11 block"
      aria-label="กราฟคลื่นความถี่เสียงแบบเรียลไทม์"
    />
  );
}
