import { useEffect, useRef } from 'react';
import {
  beatPeriodSec,
  ecgAt,
  jitteredPeriod,
  plethAt,
  shapeLead,
  type EcgLead,
  type WaveSpec,
} from '@/view';

export type WaveKind = 'ecg' | 'pleth' | 'abp' | 'cvp' | 'etco2';

export interface WaveformCanvasProps {
  kind: WaveKind;
  wave: WaveSpec | null;
  hr: number;
  /** EtCO2 方波跟呼吸率，唔另造一個讀數 */
  rr?: number;
  lead?: EcgLead;
  amplitude: number;
  sweepSeconds: number;
  targetFps: number;
  label: string;
}

const WIDTH = 480;
const HEIGHT = 72;
const ERASE_PX = 14;

function sampleY(
  kind: WaveKind,
  phase: number,
  period: number,
  time: number,
  wave: WaveSpec,
  amp: number,
  lead: EcgLead,
  rr: number,
) {
  if (kind === 'ecg') {
    const v = shapeLead(ecgAt(phase, period, wave, time), lead);
    return HEIGHT * 0.72 - v * HEIGHT * 0.58;
  }
  if (kind === 'abp') {
    if (wave.kind !== 'sinus')
      return HEIGHT * 0.72 - ecgAt(phase, period, wave, time) * HEIGHT * 0.2;
    const v = Math.pow(Math.max(0, plethAt(phase, period, wave, amp)), 0.55);
    return HEIGHT * 0.9 - v * HEIGHT * 0.72;
  }
  if (kind === 'cvp') {
    if (wave.kind !== 'sinus') return HEIGHT * 0.62;
    const v = 0.5 + 0.5 * Math.sin((2 * Math.PI * time) / Math.max(period, 0.3));
    return HEIGHT * 0.62 - v * HEIGHT * 0.16;
  }
  if (kind === 'etco2') {
    if (wave.kind === 'flat') return HEIGHT * 0.82;
    const breath = 60 / Math.max(4, rr);
    const high = time % breath < breath * 0.4 ? 0.12 : 0.82;
    return HEIGHT * 0.88 - high * HEIGHT * 0.62;
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
    const state = { phase: 0, time: 0, beat: 0, x: 0, last: 0, accumulator: 0, frame: 0 };
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
      const basePeriod = beatPeriodSec(hr);
      const periodOf = () =>
        wave.kind === 'sinus' && wave.periodJitter
          ? jitteredPeriod(basePeriod, wave.periodJitter, state.beat)
          : basePeriod;
      let period = periodOf();
      for (let i = 0; i < steps; i += 1) {
        state.phase += stepSec;
        state.time += stepSec;
        while (state.phase >= period) {
          state.phase -= period;
          state.beat += 1;
          period = periodOf();
        }
        buffer[state.x] = sampleY(
          kind,
          state.phase,
          period,
          state.time,
          wave,
          amplitude,
          live.current.lead ?? 'II',
          live.current.rr ?? 16,
        );
        state.x = (state.x + 1) % WIDTH;
      }
    };

    const stepSec = live.current.sweepSeconds / WIDTH;
    advance(WIDTH, stepSec);
    if (reduced) {
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
  }, [hasWave, props.kind]);

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
