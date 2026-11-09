/**
 * Vitals 軌跡（implementation-plan §4.3）：
 *   current ＝ approach(base, 狀態目標, 斜率 × dt) ＋ 生效中 order 嘅 delta ＋ 有界噪音（rng.vitals）
 * 全部係純函數：同 state、同 rng ＝ 同結果。Order 效果由 state.orders 即時推算，所以取消 order 即去除效果。
 */
import type { EngineConfig } from '../core/config';
import { rngFloat, type RngState } from '../core/rng';
import type { Order } from '../orders/orderTypes';
import type { Patient } from './patient';
import type {
  EngineTables,
  OrderEffectRow,
  TrajectoryRow,
  VitalDelta,
  VitalKey,
  VitalNumbers,
} from './tables';
import { VITAL_KEYS } from './tables';

export function approach(current: number, target: number, maxStep: number): number {
  const gap = target - current;
  if (Math.abs(gap) <= maxStep) return target;
  return current + Math.sign(gap) * maxStep;
}

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

export function roundVital(key: VitalKey, value: number): number {
  return key === 'temp' ? Math.round(value * 10) / 10 : Math.round(value);
}

/** 0 → 1（起效後漸進）→ 如有 duration 則再漸退回 0 */
export function effectFactor(
  row: Pick<OrderEffectRow, 'delaySec' | 'rampSec' | 'durationSec'>,
  startsAt: number,
  t: number,
): number {
  const onset = startsAt + row.delaySec;
  if (t <= onset) return 0;
  const rampIn = Math.min(1, (t - onset) / row.rampSec);
  if (row.durationSec === null) return rampIn;
  const end = onset + row.durationSec;
  if (t <= end) return rampIn;
  return rampIn * (1 - Math.min(1, (t - end) / row.rampSec));
}

export function pickEffectRow(
  rows: readonly OrderEffectRow[],
  catalogId: string,
  fsmState: string,
): OrderEffectRow | undefined {
  const candidates = rows.filter((r) => r.catalogId === catalogId);
  return (
    candidates.find((r) => r.states.includes(fsmState)) ??
    candidates.find((r) => r.states.includes('*'))
  );
}

export function isEffectiveOrder(order: Order, patientId: string): boolean {
  return order.patientId === patientId && (order.status === 'RUNNING' || order.status === 'DONE');
}

/**
 * 取消後保留嘅比例：只有 KEEP_PARTIAL 嘅 order 會保留已投入部分（例如已滴入嘅輸液），
 * 其餘取消即全部撤回。冇開始過（等把關時取消）嘅 order 比例為 0。
 */
export function sunkFraction(order: Order, tables: EngineTables): number {
  if (order.status !== 'CANCELLED' || order.cancelledAt === null) return 0;
  const row = tables['order-catalog'].find((r) => r.id === order.catalogId);
  if (row?.sunkEffectRule !== 'KEEP_PARTIAL') return 0;
  const span = order.completesAt - order.startsAt;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (order.cancelledAt - order.startsAt) / span));
}

export function effectDeltaAt(
  patient: Patient,
  orders: Readonly<Record<string, Order>>,
  tables: EngineTables,
  t: number,
): Record<VitalKey, number> {
  const total: Record<VitalKey, number> = { hr: 0, sbp: 0, dbp: 0, spo2: 0, rr: 0, temp: 0 };
  for (const order of Object.values(orders)) {
    if (order.patientId !== patient.id) continue;
    const scale = isEffectiveOrder(order, patient.id) ? 1 : sunkFraction(order, tables);
    if (scale === 0) continue;
    const row = pickEffectRow(tables['order-effects'], order.catalogId, patient.hidden.fsm.state);
    if (row) {
      const factor = effectFactor(row, order.startsAt, t) * scale;
      if (factor !== 0) {
        const delta: VitalDelta = row.delta;
        for (const key of VITAL_KEYS) total[key] += (delta[key] ?? 0) * factor;
      }
    }
    const preset = order.effectPreset;
    if (preset) {
      total.sbp += preset.sbp * scale;
      total.hr += preset.hr * scale;
      total.rr += preset.rr * scale;
      total.temp += preset.temp * scale;
    }
  }
  for (const effect of patient.hidden.activeEffects) {
    const factor = effectFactor({ delaySec: 0, ...effect }, effect.startsAt, t);
    if (factor === 0) continue;
    for (const key of VITAL_KEYS) total[key] += (effect.delta[key] ?? 0) * factor;
  }
  return total;
}

export interface SampleResult {
  base: VitalNumbers;
  vitals: VitalNumbers;
  rng: RngState;
}

export function nextSample(input: {
  patient: Patient;
  orders: Readonly<Record<string, Order>>;
  tables: EngineTables;
  config: EngineConfig;
  trajectory: TrajectoryRow;
  rng: RngState;
  t: number;
}): SampleResult {
  const { patient, trajectory, config, t } = input;
  const dtMin = Math.max(0, t - patient.hidden.lastSampleAt) / 60;
  const delta = effectDeltaAt(patient, input.orders, input.tables, t);

  let rng = input.rng;
  const base = {} as VitalNumbers;
  const raw = {} as VitalNumbers;
  for (const key of VITAL_KEYS) {
    base[key] = approach(
      patient.hidden.base[key],
      trajectory.target[key],
      trajectory.slopePerMin[key] * dtMin,
    );
    const draw = rngFloat(rng, 'vitals');
    rng = draw.rng;
    const noise = (draw.value * 2 - 1) * trajectory.noise[key];
    raw[key] = base[key] + delta[key] + noise;
  }

  const vitals = {} as VitalNumbers;
  for (const key of VITAL_KEYS) {
    vitals[key] = roundVital(key, clamp(raw[key], config.vitals.limits[key]));
  }
  vitals.dbp = Math.min(vitals.dbp, vitals.sbp - 10);
  return { base, vitals, rng };
}

/** 同 family 嘅 rhythm 按 HR 範圍自動揀（例如竇性節律／心搏過速／過緩） */
export function resolveRhythm(rhythmId: string, hr: number, tables: EngineTables): string {
  const row = tables.rhythms.find((r) => r.id === rhythmId);
  if (!row) throw new Error(`未知 rhythm：${rhythmId}`);
  const sameFamily = tables.rhythms.filter((r) => r.family === row.family);
  const match = sameFamily.find((r) => hr >= r.hrRange[0] && hr < r.hrRange[1]);
  return match?.id ?? row.id;
}
