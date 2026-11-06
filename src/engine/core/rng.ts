/**
 * 分流 seeded RNG（implementation-plan §2.2、§4.1）。
 * 每條 stream 只有一個 uint32 狀態，可直接寫入存檔；各 stream 互不影響，
 * 所以某一系統多抽一次，唔會改變其他系統嘅隨機序列。
 */
import { z } from 'zod';

export const RNG_STREAMS = ['vitals', 'events', 'consequence', 'cpr', 'calls', 'staff'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

const uint32 = z.number().int().min(0).max(0xffffffff);

export const rngStateSchema = z
  .object({
    vitals: uint32,
    events: uint32,
    consequence: uint32,
    cpr: uint32,
    calls: uint32,
    staff: uint32,
  })
  .strict();

export type RngState = z.infer<typeof rngStateSchema>;

/** xmur3：字串 → uint32 */
function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRngState(seed: string): RngState {
  const state = {} as Record<RngStream, number>;
  for (const stream of RNG_STREAMS) {
    state[stream] = hashString(`${seed}\u0000${stream}`);
  }
  return state;
}

export interface RngDraw<T> {
  value: T;
  rng: RngState;
}

/** mulberry32：回傳 [0, 1) 嘅浮點數同新狀態 */
export function rngFloat(rng: RngState, stream: RngStream): RngDraw<number> {
  const next = (rng[stream] + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { ...rng, [stream]: next } };
}

/** 整數，範圍 [minInclusive, maxExclusive) */
export function rngInt(
  rng: RngState,
  stream: RngStream,
  minInclusive: number,
  maxExclusive: number,
): RngDraw<number> {
  if (
    !Number.isInteger(minInclusive) ||
    !Number.isInteger(maxExclusive) ||
    maxExclusive <= minInclusive
  ) {
    throw new RangeError(`rngInt 範圍無效：[${String(minInclusive)}, ${String(maxExclusive)})`);
  }
  const draw = rngFloat(rng, stream);
  return {
    value: minInclusive + Math.floor(draw.value * (maxExclusive - minInclusive)),
    rng: draw.rng,
  };
}

/** 擲骰：`roll < p` 即命中（同 implementation-plan §7.3 gate.danger 一致） */
export function rngChance(rng: RngState, stream: RngStream, p: number): RngDraw<boolean> {
  const draw = rngFloat(rng, stream);
  return { value: draw.value < p, rng: draw.rng };
}
