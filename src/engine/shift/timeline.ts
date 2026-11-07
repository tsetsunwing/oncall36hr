/**
 * 模式時間線（implementation-plan §8.2）：全部由 config 推導，純函數。
 * 時間 t ＝ 由開更起計嘅遊戲秒；牆鐘 ＝ 開更時刻 ＋ t。
 */
import type { EngineConfig } from '../core/config';
import type { Mode } from '../core/state';

/** 時間線只需要 config 嘅呢三組，view 層亦可以直接用 */
export type TimelineConfig = Pick<EngineConfig, 'shifts' | 'rounds' | 'meals'>;

export type SegmentKind = 'DAY' | 'NIGHT';

export interface Segment {
  kind: SegmentKind;
  startSec: number;
  endSec: number;
}

const DAY_SECONDS = 86_400;
const HOUR = 3600;

export function startHourOf(config: TimelineConfig, mode: Mode): number {
  switch (mode) {
    case 'DAY':
      return config.shifts.day.startHour;
    case 'NIGHT':
      return config.shifts.night.startHour;
    case 'ONCALL':
      return config.shifts.onCall.startHour;
  }
}

export function regularSecondsOf(config: TimelineConfig, mode: Mode): number {
  switch (mode) {
    case 'DAY':
      return config.shifts.day.regularSeconds;
    case 'NIGHT':
      return config.shifts.night.regularSeconds;
    case 'ONCALL':
      return config.shifts.onCall.regularSeconds;
  }
}

/** On call 分三段（日、夜、日），段間冇交班（S6 B） */
export function segmentsOf(config: TimelineConfig, mode: Mode): Segment[] {
  if (mode === 'DAY')
    return [{ kind: 'DAY', startSec: 0, endSec: config.shifts.day.regularSeconds }];
  if (mode === 'NIGHT') {
    return [{ kind: 'NIGHT', startSec: 0, endSec: config.shifts.night.regularSeconds }];
  }
  const kinds: SegmentKind[] = ['DAY', 'NIGHT', 'DAY'];
  const segments: Segment[] = [];
  let cursor = 0;
  config.shifts.onCall.segmentHours.forEach((hours, index) => {
    const startSec = cursor;
    cursor += hours * HOUR;
    segments.push({ kind: kinds[index] ?? 'DAY', startSec, endSec: cursor });
  });
  return segments;
}

export function segmentAt(config: TimelineConfig, mode: Mode, t: number): Segment | null {
  const segments = segmentsOf(config, mode);
  return segments.find((s) => t >= s.startSec && t < s.endSec) ?? segments.at(-1) ?? null;
}

/** 喺 [fromSec, toSec) 內，牆鐘為 hour 點嘅所有 t */
function occurrences(startHour: number, hour: number, fromSec: number, toSec: number): number[] {
  const first = ((((hour - startHour) * HOUR) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const result: number[] = [];
  for (let t = first; t < toSec; t += DAY_SECONDS) if (t >= fromSec) result.push(t);
  return result;
}

/** 巡房時間：只喺日班分段內，按 config.rounds.hours（09:00、14:00） */
export function roundTimes(config: TimelineConfig, mode: Mode): number[] {
  const startHour = startHourOf(config, mode);
  const times: number[] = [];
  for (const segment of segmentsOf(config, mode)) {
    if (segment.kind !== 'DAY') continue;
    for (const hour of config.rounds.hours) {
      times.push(...occurrences(startHour, hour, segment.startSec, segment.endSec));
    }
  }
  return times.sort((a, b) => a - b);
}

export interface MealNode {
  index: number;
  kind: 'LUNCH' | 'DINNER';
  startSec: number;
  endSec: number;
}

/** 用餐節點：12:00 午餐、20:00 晚餐，只計規定時間內；每個節點有 windowSeconds 窗口 */
export function mealNodes(config: TimelineConfig, mode: Mode): MealNode[] {
  const startHour = startHourOf(config, mode);
  const regular = regularSecondsOf(config, mode);
  const raw: { kind: MealNode['kind']; t: number }[] = [];
  for (const t of occurrences(startHour, config.meals.lunchHour, 0, regular)) {
    raw.push({ kind: 'LUNCH', t });
  }
  for (const t of occurrences(startHour, config.meals.dinnerHour, 0, regular)) {
    raw.push({ kind: 'DINNER', t });
  }
  return raw
    .sort((a, b) => a.t - b.t)
    .map((node, index) => ({
      index,
      kind: node.kind,
      startSec: node.t,
      endSec: node.t + config.meals.windowSeconds,
    }));
}

export function activeMeal(config: TimelineConfig, mode: Mode, t: number): MealNode | null {
  return mealNodes(config, mode).find((m) => t >= m.startSec && t < m.endSec) ?? null;
}

export function overtimeEndOf(config: TimelineConfig, mode: Mode): number {
  return regularSecondsOf(config, mode) + config.shifts.overtimeSeconds;
}
