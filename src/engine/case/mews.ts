/** MEWS 計算：只讀 content/mews 表（T10），engine 唔內置任何分段。 */
import type {
  Consciousness,
  MewsAlert,
  MewsComponentKey,
  MewsRange,
  MewsRow,
  VitalNumbers,
} from './tables';
import { MEWS_COMPONENT_KEYS } from './tables';

export interface MewsResult {
  score: number;
  band: string;
  alert: MewsAlert;
  /** 各項分數（含 avpu） */
  components: Record<MewsComponentKey | 'avpu', number>;
}

/** 區間為 [min, max)；null ＝ 無下限／上限 */
export function findRange(ranges: readonly MewsRange[], value: number): MewsRange | undefined {
  return ranges.find(
    (r) => (r.min === null || value >= r.min) && (r.max === null || value < r.max),
  );
}

export function bandFor(table: MewsRow, score: number): { id: string; alert: MewsAlert } {
  const band = table.bands.find((b) => score >= b.min && (b.max === null || score <= b.max));
  if (!band) throw new Error(`MEWS band 唔覆蓋分數 ${String(score)}`);
  return { id: band.id, alert: band.alert };
}

export function computeMews(
  vitals: Pick<VitalNumbers, MewsComponentKey>,
  consciousness: Consciousness,
  table: MewsRow,
): MewsResult {
  const components = { avpu: table.avpu[consciousness] } as Record<
    MewsComponentKey | 'avpu',
    number
  >;
  let score = components.avpu;
  for (const key of MEWS_COMPONENT_KEYS) {
    const range = findRange(table.components[key], vitals[key]);
    if (!range) throw new Error(`MEWS 表 ${key} 唔覆蓋數值 ${String(vitals[key])}`);
    components[key] = range.score;
    score += range.score;
  }
  const band = bandFor(table, score);
  return { score, band: band.id, alert: band.alert, components };
}

export function meanArterialPressure(sbp: number, dbp: number): number {
  return Math.round((sbp + 2 * dbp) / 3);
}
