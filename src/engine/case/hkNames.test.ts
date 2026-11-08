import { describe, expect, it } from 'vitest';
import { HK_GIVEN_FEMALE, HK_GIVEN_MALE, HK_SURNAMES, pickHkName } from './hkNames';

describe('香港姓名', () => {
  it('同一個 seed 同病人 id 永遠抽到同一個名', () => {
    const first = pickHkName('seed-a', 'p1', 'F', new Set());
    expect(pickHkName('seed-a', 'p1', 'F', new Set())).toBe(first);
    expect(pickHkName('seed-b', 'p1', 'F', new Set())).not.toBe(first);
  });

  it('女性名只用女名，男性名只用男名，同場唔重複', () => {
    const used = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const sex = i % 2 === 0 ? 'F' : 'M';
      const name = pickHkName('ward', `p${String(i)}`, sex, used);
      used.add(name);
      const surname = HK_SURNAMES.find((item) => name.startsWith(item));
      expect(surname).toBeTruthy();
      const given = name.slice(surname?.length ?? 0);
      const pool = sex === 'F' ? HK_GIVEN_FEMALE : HK_GIVEN_MALE;
      expect(pool).toContain(given);
    }
    expect(used.size).toBe(20);
  });
});
