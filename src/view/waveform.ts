/**
 * 監察儀波形（純函數、只做呈現）：由 content/rhythms 嘅波形表同 engine 提供嘅 HR 生成 Lead II 同 Pleth。
 * 完全以「距離上一次心跳嘅時間」為輸入，所以 HR 改變時 UI 用相位累加就唔會跳格。
 * 無隨機、無閃爍；數值只係畫面，唔會寫返任何 state。
 */
import { z } from 'zod';

const componentSchema = z.object({
  offsetSec: z.number(),
  widthSec: z.number().positive(),
  amplitude: z.number(),
});

const waveSchema = z.object({
  kind: z.literal('sinus'),
  ecg: z.array(componentSchema).min(1),
  pleth: z.object({
    delaySec: z.number().min(0),
    riseSec: z.number().positive(),
    fallSec: z.number().positive(),
    notchSec: z.number().positive(),
    notchAmplitude: z.number().min(0).max(1),
  }),
});

export type WaveSpec = z.infer<typeof waveSchema>;

export function parseWave(raw: unknown): WaveSpec | null {
  const parsed = waveSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const REFERENCE_PERIOD_SEC = 0.85;
const QRS_HALF_WINDOW_SEC = 0.05;

export function beatPeriodSec(hr: number): number {
  return 60 / Math.max(1, hr);
}

function gauss(x: number, width: number): number {
  const z = x / width;
  return Math.exp(-0.5 * z * z);
}

/** Lead II：sinceBeat ＝ 距離最近一次 R 波嘅秒數（0 ≤ sinceBeat < period） */
export function ecgAt(sinceBeat: number, period: number, wave: WaveSpec): number {
  const squeeze = Math.min(1, period / REFERENCE_PERIOD_SEC);
  let total = 0;
  for (const beat of [-1, 0, 1]) {
    const t = sinceBeat - beat * period;
    for (const c of wave.ecg) {
      const offset =
        Math.abs(c.offsetSec) > QRS_HALF_WINDOW_SEC ? c.offsetSec * squeeze : c.offsetSec;
      total += c.amplitude * gauss(t - offset, c.widthSec);
    }
  }
  return total;
}

/** Pleth：脈搏波，amplitude 約 0..1（由脈壓縮放） */
export function plethAt(sinceBeat: number, period: number, wave: WaveSpec, amplitude = 1): number {
  const p = wave.pleth;
  let total = 0;
  for (const beat of [-2, -1, 0]) {
    const u = sinceBeat - beat * period - p.delaySec;
    if (u < 0) continue;
    if (u < p.riseSec) {
      total += 0.5 - 0.5 * Math.cos((Math.PI * u) / p.riseSec);
    } else {
      const v = u - p.riseSec;
      total += Math.exp(-v / p.fallSec) + p.notchAmplitude * 0.25 * gauss(v - p.notchSec, 0.04);
    }
  }
  return Math.min(1.2, total) * amplitude;
}

/** 脈壓 → pleth 振幅：窄脈壓（休克）→ 細波 */
export function plethAmplitude(sbp: number, dbp: number): number {
  return Math.min(1, Math.max(0.35, (sbp - dbp) / 45));
}
