import { useEffect, useRef } from 'react';
import { beatPeriodSec, ecgAt, plethAt, type WaveSpec } from '@/view';

export interface WaveformCanvasProps {
  kind: 'ecg' | 'pleth';
  wave: WaveSpec | null;
  hr: number;
  amplitude: number;
  sweepSeconds: number;
  targetFps: number;
  label: string;
}

const WIDTH = 480;
const HEIGHT = 72;
const ERASE_PX = 14;

function sampleY(kind: 'ecg' | 'pleth', phase: number, hr: number, wave: WaveSpec, amp: number) {
  const period = beatPeriodSec(hr);
  if (kind === 'ecg') {
    const v = ecgAt(phase, period, wave);
    return HEIGHT * 0.72 - v * HEIGHT * 0.58;
  }
  const v = plethAt(phase, period, wave, amp);
  return HEIGHT * 0.88 - v * HEIGHT * 0.74;
}

/**
 * 示意波形：由節律表同心率生成（view/waveform），逐像素掃描繪製。
 * 純呈現：冇閃爍；`prefers-reduced-motion` 時只畫靜態一屏，唔做動畫。
 */
export function WaveformCanvas(props: WaveformCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  const hasWave = props.wave !== null;

  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !hasWave) return;

    const buffer = new Float32Array(WIDTH).fill(HEIGHT / 2);
    const state = { phase: 0, x: 0, last: 0, accumulator: 0, frame: 0 };
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stroke = () => getComputedStyle(canvas).color;

    const render = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke();
      ctx.beginPath();
      let pen = false;
      for (let x = 0; x < WIDTH; x += 1) {
        const inGap = !reduced && (x - state.x + WIDTH) % WIDTH < ERASE_PX;
        if (inGap) {
          pen = false;
          continue;
        }
        const y = buffer[x] ?? HEIGHT / 2;
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    };

    const advance = (steps: number, stepSec: number) => {
      const { wave, hr, amplitude, kind } = live.current;
      if (!wave) return;
      const period = beatPeriodSec(hr);
      for (let i = 0; i < steps; i += 1) {
        state.phase += stepSec;
        while (state.phase >= period) state.phase -= period;
        buffer[state.x] = sampleY(kind, state.phase, hr, wave, amplitude);
        state.x = (state.x + 1) % WIDTH;
      }
    };

    if (reduced) {
      const stepSec = live.current.sweepSeconds / WIDTH;
      advance(WIDTH, stepSec);
      render();
      return;
    }

    let raf = 0;
    const loop = (ts: number) => {
      raf = window.requestAnimationFrame(loop);
      const { sweepSeconds, targetFps } = live.current;
      if (state.last === 0) state.last = ts;
      const elapsed = ts - state.last;
      if (elapsed < 1000 / targetFps) return;
      state.last = ts;
      const stepSec = sweepSeconds / WIDTH;
      state.accumulator += Math.min(elapsed, 250) / 1000;
      const steps = Math.floor(state.accumulator / stepSec);
      state.accumulator -= steps * stepSec;
      advance(Math.min(steps, WIDTH), stepSec);
      render();
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [hasWave, props.kind, props.hr]);

  return (
    <canvas
      ref={ref}
      className={`waveform waveform--${props.kind}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={props.label}
    />
  );
}
