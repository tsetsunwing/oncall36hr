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

const plethSchema = z.object({
  delaySec: z.number().min(0),
  riseSec: z.number().positive(),
  fallSec: z.number().positive(),
  notchSec: z.number().positive(),
  notchAmplitude: z.number().min(0).max(1),
});

const waveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sinus'),
    ecg: z.array(componentSchema).min(1),
    pleth: plethSchema.nullable(),
    periodJitter: z.number().min(0).max(0.5).optional(),
    baseline: z.object({ freqHz: z.number().positive(), amplitude: z.number().min(0) }).optional(),
  }),
  z.object({
    kind: z.literal('fibrillation'),
    components: z
      .array(z.object({ freqHz: z.number().positive(), amplitude: z.number().min(0) }))
      .min(1),
    envelopeHz: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('flat'),
    driftAmplitude: z.number().min(0),
    driftFreqHz: z.number().positive(),
  }),
]);

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

/**
 * 不規則週期（AF）：每拍週期由拍序號決定性偏移，唔用隨機（畫面表現層，唔入 state）。
 * 回傳值落喺 [base × (1 − jitter), base × (1 + jitter)]。
 */
export function jitteredPeriod(basePeriod: number, jitter: number, beatIndex: number): number {
  const x = Math.sin(beatIndex * 12.9898 + 78.233) * 43758.5453;
  const unit = (x - Math.floor(x)) * 2 - 1;
  return basePeriod * (1 + jitter * unit);
}

const TWO_PI = 2 * Math.PI;

/**
 * Lead II：sinus 類波形用 sinceBeat（距離最近一次 R 波嘅秒數，0 ≤ sinceBeat < period）；
 * fibrillation／flat 只用 timeSec（連續時間），所以停頓節律唔使有「心跳」。
 */
export function ecgAt(sinceBeat: number, period: number, wave: WaveSpec, timeSec = 0): number {
  if (wave.kind === 'fibrillation') {
    const envelope = wave.envelopeHz
      ? 0.55 + 0.45 * Math.sin(TWO_PI * wave.envelopeHz * timeSec)
      : 1;
    let sum = 0;
    wave.components.forEach((c, i) => {
      sum += c.amplitude * Math.sin(TWO_PI * c.freqHz * timeSec + i * 1.7);
    });
    return sum * envelope;
  }
  if (wave.kind === 'flat') {
    return wave.driftAmplitude * Math.sin(TWO_PI * wave.driftFreqHz * timeSec);
  }
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
  if (wave.baseline) {
    total += wave.baseline.amplitude * Math.sin(TWO_PI * wave.baseline.freqHz * timeSec);
  }
  return total;
}

/** Pleth：脈搏波，amplitude 約 0..1（由脈壓縮放） */
export function plethAt(sinceBeat: number, period: number, wave: WaveSpec, amplitude = 1): number {
  if (wave.kind !== 'sinus' || wave.pleth === null) return 0;
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
