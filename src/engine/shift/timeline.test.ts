import { describe, expect, it } from 'vitest';
import { kitConfig } from './shiftKit';
import {
  activeMeal,
  mealNodes,
  overtimeEndOf,
  regularSecondsOf,
  roundTimes,
  segmentsOf,
} from './timeline';

const H = 3600;

describe('模式時間線（§8.2）', () => {
  it('必須完成時長：日班 10 小時、夜班 14 小時、On call 34 小時；超時窗口 2 小時', () => {
    expect(regularSecondsOf(kitConfig, 'DAY')).toBe(10 * H);
    expect(regularSecondsOf(kitConfig, 'NIGHT')).toBe(14 * H);
    expect(regularSecondsOf(kitConfig, 'ONCALL')).toBe(34 * H);
    expect(overtimeEndOf(kitConfig, 'DAY')).toBe(12 * H);
    expect(overtimeEndOf(kitConfig, 'NIGHT')).toBe(16 * H);
    expect(overtimeEndOf(kitConfig, 'ONCALL')).toBe(36 * H);
  });

  it('On call 分三段（日、夜、日），段間冇交班', () => {
    expect(segmentsOf(kitConfig, 'ONCALL')).toEqual([
      { kind: 'DAY', startSec: 0, endSec: 10 * H },
      { kind: 'NIGHT', startSec: 10 * H, endSec: 24 * H },
      { kind: 'DAY', startSec: 24 * H, endSec: 34 * H },
    ]);
  });

  it('巡房 09:00／14:00：日班兩次、夜班冇、On call 共四次（兩段日班各兩次）', () => {
    expect(roundTimes(kitConfig, 'DAY')).toEqual([1 * H, 6 * H]);
    expect(roundTimes(kitConfig, 'NIGHT')).toEqual([]);
    expect(roundTimes(kitConfig, 'ONCALL')).toEqual([1 * H, 6 * H, 25 * H, 30 * H]);
    expect(roundTimes(kitConfig, 'ONCALL')).toHaveLength(kitConfig.rounds.onCallRoundsTotal);
  });

  it('用餐節點：日班午餐、夜班晚餐、On call 午晚午三個；每個有 windowSeconds 窗口', () => {
    expect(mealNodes(kitConfig, 'DAY').map((m) => [m.kind, m.startSec])).toEqual([
      ['LUNCH', 4 * H],
    ]);
    expect(mealNodes(kitConfig, 'NIGHT').map((m) => [m.kind, m.startSec])).toEqual([
      ['DINNER', 2 * H],
    ]);
    expect(mealNodes(kitConfig, 'ONCALL').map((m) => [m.kind, m.startSec])).toEqual([
      ['LUNCH', 4 * H],
      ['DINNER', 12 * H],
      ['LUNCH', 28 * H],
    ]);
    const lunch = mealNodes(kitConfig, 'DAY')[0];
    expect(lunch?.endSec).toBe(4 * H + kitConfig.meals.windowSeconds);
    expect(activeMeal(kitConfig, 'DAY', 4 * H + 10)?.kind).toBe('LUNCH');
    expect(activeMeal(kitConfig, 'DAY', 3 * H)).toBeNull();
  });
});
