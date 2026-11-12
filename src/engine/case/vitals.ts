/**
 * Vitals 軌跡（implementation-plan §4.3）：
 *   current ＝ approach(base, 狀態目標, 斜率 × dt) ＋ 生效中 order 嘅 delta ＋ 有界噪音（rng.vitals）
 * 全部係純函數：同 state、同 rng ＝ 同結果。Order 效果由 state.orders 即時推算，所以取消 order 即去除效果。
 */
import type { EngineConfig } from '../core/config';
import { hashString, rngFloat, type RngState } from '../core/rng';
import { fluidVolumeFactor } from '../orders/infusionVolume';
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

/**
 * 遞減效應：藥效按「現值距離正常目標幾遠」縮放。
 * 降嘅藥（delta<0）睇現值高過正常幾多；升嘅藥（delta>0）睇現值低過正常幾多。
 * 貼近正常 → 剩低 residual 比例；到達極端值 → 全數藥效。delta 為 0 時無需縮放。
 */
export function drugScale(
  current: number,
  delta: number,
  target: number,
  extreme: { low: number; high: number },
  residual: number,
): number {
  if (delta === 0) return 1;
  let headroom: number;
  if (delta < 0) {
    const span = extreme.high - target;
    headroom = span <= 0 ? 1 : clamp((current - target) / span, [0, 1]);
  } else {
    const span = target - extreme.low;
    headroom = span <= 0 ? 1 : clamp((target - current) / span, [0, 1]);
  }
  return residual + (1 - residual) * headroom;
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
  /** 傳入先啟用藥物嘅遞減效應、隨機幅度同途徑 onset；唔傳就維持舊行為 */
  config?: EngineConfig,
): Record<VitalKey, number> {
  const drugEffect = config?.drugEffect;
  const total: Record<VitalKey, number> = { hr: 0, sbp: 0, dbp: 0, spo2: 0, rr: 0, temp: 0 };
  for (const order of Object.values(orders)) {
    if (order.patientId !== patient.id) continue;
    const latestAdministration = order.administrations
      ?.filter((dose) => dose.status === 'GIVEN' && dose.givenAt !== null && dose.givenAt <= t)
      .at(-1);
    // A scheduled prescription has no effect until a dose is actually given.
    const scale =
      order.administrations || order.params.prnReason
        ? latestAdministration
          ? 1
          : 0
        : isEffectiveOrder(order, patient.id)
          ? 1
          : sunkFraction(order, tables);
    if (scale === 0) continue;
    // 輸液以第一袋開始時間起效；效果再按實際滴入容量縮放（提早停袋只計部分）。
    const effectStart =
      latestAdministration?.givenAt ?? order.fluidBags?.[0]?.startAt ?? order.startsAt;
    const volumeFactor = order.fluidBags ? fluidVolumeFactor(order, t) : 1;
    if (volumeFactor === 0) continue;
    const catalogRow = tables['order-catalog'].find((r) => r.id === order.catalogId);
    const isDrug = order.effectPreset !== undefined || catalogRow?.type === 'DRUG';
    const route = order.params.route;
    const routeOnset = isDrug && drugEffect && route ? (drugEffect.routeOnsetSec[route] ?? 0) : 0;
    const routeRamp = isDrug && drugEffect && route ? (drugEffect.routeRampSec[route] ?? 0) : 0;
    // 每張醫囑用 id 抽一次固定幅度（xmur3 雜湊，唔用 rng stream，存檔後唔會變）。
    const jitterMul =
      drugEffect !== undefined
        ? 1 + (((hashString(order.id) % 2001) - 1000) / 1000) * drugEffect.jitterFraction
        : 1;
    const row = pickEffectRow(tables['order-effects'], order.catalogId, patient.hidden.fsm.state);
    if (row) {
      const factor =
        effectFactor(
          {
            delaySec: row.delaySec + routeOnset,
            rampSec: Math.max(row.rampSec, routeRamp),
            durationSec: row.durationSec,
          },
          effectStart,
          t,
        ) *
        scale *
        volumeFactor;
      if (factor !== 0) {
        const delta: VitalDelta = row.delta;
        for (const key of VITAL_KEYS) {
          let value = delta[key] ?? 0;
          if (isDrug && drugEffect && value !== 0) {
            value *=
              drugScale(
                patient.hidden.base[key],
                value,
                drugEffect.normalTarget[key],
                drugEffect.extremeAt[key],
                drugEffect.residualFraction,
              ) * jitterMul;
          }
          total[key] += value * factor;
        }
      }
    }
    const preset = order.effectPreset;
    if (preset) {
      let presetFactor = scale;
      if (isDrug && drugEffect) {
        presetFactor *= effectFactor(
          { delaySec: routeOnset, rampSec: routeRamp, durationSec: null },
          effectStart,
          t,
        );
      }
      if (presetFactor !== 0) {
        const scalePreset = (value: number, key: 'hr' | 'sbp' | 'rr' | 'temp'): number => {
          if (!isDrug || !drugEffect || value === 0) return value;
          return (
            value *
            drugScale(
              patient.hidden.base[key],
              value,
              drugEffect.normalTarget[key],
              drugEffect.extremeAt[key],
              drugEffect.residualFraction,
            ) *
            jitterMul
          );
        };
        total.sbp += scalePreset(preset.sbp, 'sbp') * presetFactor;
        total.hr += scalePreset(preset.hr, 'hr') * presetFactor;
        total.rr += scalePreset(preset.rr, 'rr') * presetFactor;
        total.temp += scalePreset(preset.temp, 'temp') * presetFactor;
      }
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
  const delta = effectDeltaAt(patient, input.orders, input.tables, t, input.config);

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
