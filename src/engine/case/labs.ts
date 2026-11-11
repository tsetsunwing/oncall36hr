/**
 * 病人身上儲存的化驗數值。
 *
 * 規則：
 * 1. 建立病人時，每項化驗有一個起始值：診斷指定嘅值（`byDiagnosis`）優先，
 *    否則用同年齡同性別嘅正常基準（`lab-baselines`）。再加 ±2% 個體差異。
 * 2. 每次重複檢查只在儲存值上加 ±0.5% 嘅小變動，睇不出走勢，亦唔會累積。
 * 3. 只有介入／治療才會真正改動儲存值（見 lab-effects）。
 */
import { hashString } from '../core/rng';
import type { EngineTables, LabBaselineRow, LabEffectRow, ResultItemRow } from './tables';

/** 建立病人時嘅個體差異（±2%）。 */
export const LAB_SEED_SPREAD = 0.02;
/** 每次重複檢查嘅小變動（±0.5%），不足以看出走勢。 */
export const LAB_REPEAT_SPREAD = 0.005;

export interface LabReading {
  value: number;
  /** 最後一次真正改動嘅時間（重複檢查嘅小變動唔會更新呢個時間） */
  at: number;
}

/** 由字串決定嘅穩定噪音，範圍 −spread 至 +spread。同 seed 一齊用，所以重播結果一樣。 */
export function stableNoise(key: string, spread: number): number {
  const raw = (hashString(key) % 20001) / 20000;
  return (raw * 2 - 1) * spread;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * 報告內容先按診斷、再按狀態揀。次序：
 * 診斷＋狀態 → 診斷＋'*' → 任何診斷＋狀態 → 任何診斷＋'*'。
 * 診斷有寫過就唔會退回通用值，避免「肺炎片」出現在肺栓塞病人身上。
 */
export function pickByDiagnosisAndState<T>(
  byDiagnosis: Readonly<Record<string, Readonly<Record<string, T>>>> | undefined,
  diagnosisIds: readonly string[],
  byState: Readonly<Record<string, T>>,
  state: string,
): T | undefined {
  for (const diagnosisId of diagnosisIds) {
    const bucket = byDiagnosis?.[diagnosisId];
    if (!bucket) continue;
    const hit = bucket[state] ?? bucket['*'];
    if (hit !== undefined) return hit;
  }
  return byState[state] ?? byState['*'];
}

/** 只按診斷揀。冇寫過就回 undefined，交由正常基準決定。 */
export function diagnosisBase(
  byDiagnosis: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  diagnosisIds: readonly string[],
  state: string,
): number | undefined {
  for (const diagnosisId of diagnosisIds) {
    const bucket = byDiagnosis?.[diagnosisId];
    if (!bucket) continue;
    const hit = bucket[state] ?? bucket['*'];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** 每個化驗項目 id 對應嘅表內定義（同一個 id 可能出現在幾張報告）。 */
export function resultItemIndex(tables: EngineTables): Map<string, ResultItemRow> {
  const index = new Map<string, ResultItemRow>();
  for (const result of tables.results) {
    for (const item of result.items) {
      if (!index.has(item.id)) index.set(item.id, item);
    }
  }
  return index;
}

export interface SeedLabsInput {
  patientId: string;
  seed: string;
  sex: 'M' | 'F';
  age: number;
  diagnosisIds: readonly string[];
  state: string;
  tables: EngineTables;
  t: number;
}

/**
 * 建立病人時嘅化驗起始值。全部 62 項一次過算好，之後報告直接讀，唔再查表。
 */
export function seedLabs(input: SeedLabsInput): Record<string, LabReading> {
  const index = resultItemIndex(input.tables);
  const out: Record<string, LabReading> = {};
  for (const baseline of input.tables['lab-baselines']) {
    const item = index.get(baseline.id);
    const base =
      diagnosisBase(item?.byDiagnosis, input.diagnosisIds, input.state) ??
      normalValue(baseline, input.sex, input.age);
    const noise = stableNoise(`${input.seed}|${input.patientId}|${baseline.id}`, LAB_SEED_SPREAD);
    out[baseline.id] = { value: roundTo(base * (1 + noise), baseline.decimals), at: input.t };
  }
  return out;
}

/** 同年齡同性別嘅正常值。70 歲以上加長者偏差。 */
export function normalValue(baseline: LabBaselineRow, sex: 'M' | 'F', age: number): number {
  const base = baseline.typical[sex] + (age >= 70 ? baseline.elderlyDelta : 0);
  return roundTo(base, baseline.decimals);
}

/** 報告顯示用：儲存值加一個睇不出走勢嘅小變動，唔會寫回病人身上。 */
export function readingForReport(reading: LabReading, decimals: number, key: string): number {
  return roundTo(reading.value * (1 + stableNoise(key, LAB_REPEAT_SPREAD)), decimals);
}

/** 一個介入對某一項化驗嘅修飾。 */
export interface LabModifier {
  analyte: string;
  delta: number;
  appliedAt: number;
  decayPerHour: number;
  decayUnless: string | null;
  capLow: number | null;
  capHigh: number | null;
}

function clamp(value: number, low: number | null, high: number | null): number {
  let out = value;
  if (low !== null && out < low) out = low;
  if (high !== null && out > high) out = high;
  return out;
}

/**
 * 把修飾值換算成「此刻仍然有效嘅幅度」。
 * 有 `decayUnless` 而病人已經有該旗標，就當病因斷了，唔再回跌。
 * 回跌最多扣到 0，唔會反過來拉低原本嘅值。
 */
export function modifierDeltaAt(
  modifier: LabModifier,
  t: number,
  flags: readonly string[],
): number {
  const addressed = modifier.decayUnless !== null && flags.includes(modifier.decayUnless);
  if (addressed || modifier.decayPerHour === 0) return modifier.delta;
  const hours = Math.max(0, t - modifier.appliedAt) / 3600;
  const left = modifier.delta - Math.sign(modifier.delta) * modifier.decayPerHour * hours;
  if (modifier.delta >= 0) return Math.max(0, left);
  return Math.min(0, left);
}

/**
 * 病人此刻嘅化驗值：儲存值 ＋ 各項介入修飾（會回跌、有上下限）。
 * 冇儲存值就回 undefined，交由舊做法按表查。
 */
export function labValueAt(
  base: LabReading | undefined,
  modifiers: readonly LabModifier[],
  analyte: string,
  decimals: number,
  t: number,
  flags: readonly string[],
): number | undefined {
  if (!base) return undefined;
  let value = base.value;
  for (const modifier of modifiers) {
    if (modifier.analyte !== analyte) continue;
    const delta = modifierDeltaAt(modifier, t, flags);
    if (delta === 0) continue;
    value = clamp(value + delta, modifier.capLow, modifier.capHigh);
  }
  return roundTo(value, decimals);
}

/** 由 order 嘅旗標產生修飾值。 */
export function modifiersForFlags(
  effects: readonly LabEffectRow[],
  flags: readonly string[],
  t: number,
): LabModifier[] {
  return effects
    .filter((row) => flags.includes(row.flag))
    .map((row) => ({
      analyte: row.analyte,
      delta: row.delta,
      appliedAt: t,
      decayPerHour: row.decayPerHour,
      decayUnless: row.decayUnless,
      capLow: row.capLow,
      capHigh: row.capHigh,
    }));
}
