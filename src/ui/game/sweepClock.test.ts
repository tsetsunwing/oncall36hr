import { describe, expect, it } from 'vitest';
import { sweepColumn } from './sweepClock';

describe('sweepColumn', () => {
  it('同一時刻同一掃描秒數得出同一欄，供多條波形對齊', () => {
    const now = 12_345.6;
    expect(sweepColumn(now, 6, 480)).toBe(sweepColumn(now, 6, 480));
    expect(sweepColumn(0, 6, 480)).toBe(0);
    expect(sweepColumn(3000, 6, 480)).toBe(240);
    expect(sweepColumn(6000, 6, 480)).toBe(0);
  });

  it('負時間同零參數都不會得出 NaN', () => {
    expect(sweepColumn(-100, 6, 480)).toBeGreaterThanOrEqual(0);
    expect(sweepColumn(100, 0, 480)).toBe(0);
    expect(sweepColumn(100, 6, 0)).toBe(0);
  });
});
