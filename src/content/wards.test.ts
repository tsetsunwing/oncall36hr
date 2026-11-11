import { describe, expect, it } from 'vitest';
import { DEFAULT_WARD_CODE, OPEN_WARDS, WARD_CODES, WARD_LIST, wardLabel } from './wards';

describe('病房清單', () => {
  it('52 個病房代碼，冇重複', () => {
    expect(WARD_CODES).toHaveLength(52);
    expect(new Set(WARD_CODES).size).toBe(52);
  });

  it('第一階段只開內科同外科病房', () => {
    expect(OPEN_WARDS.map((w) => w.code)).toEqual(['MED', 'SRG']);
    expect(DEFAULT_WARD_CODE).toBe('MED');
  });

  /** 兩個例外沿用醫院慣用寫法：HDU 中文叫加護病房、LW 中文叫產房 */
  const EXCEPTIONS = ['HDU', 'LW'];

  it('Unit 類唔會加 Ward，中文用部／室', () => {
    for (const def of WARD_LIST.filter((w) => w.kind === 'UNIT' && !EXCEPTIONS.includes(w.code))) {
      expect(def.en.endsWith('Ward')).toBe(false);
      expect(def.zh.endsWith('病房')).toBe(false);
    }
  });

  it('Ward 類英文加 Ward、中文加病房', () => {
    for (const def of WARD_LIST.filter((w) => w.kind === 'WARD' && !EXCEPTIONS.includes(w.code))) {
      expect(def.en.endsWith('Ward')).toBe(true);
      expect(def.zh.endsWith('病房')).toBe(true);
    }
  });

  it('標籤係中英並列', () => {
    expect(wardLabel('MED')).toBe('內科病房 General Medicine Ward');
    expect(wardLabel('SRG')).toBe('外科病房 General Surgery Ward');
  });
});
