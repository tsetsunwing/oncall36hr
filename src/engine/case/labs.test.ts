/** 病人身上儲存嘅化驗值：起始值、個體差異、重複檢查睇不出走勢。 */
import { describe, expect, it } from 'vitest';
import { realTables } from '../test/realEngine';
import {
  LAB_REPEAT_SPREAD,
  labValueAt,
  modifiersForFlags,
  LAB_SEED_SPREAD,
  diagnosisBase,
  normalValue,
  readingForReport,
  seedLabs,
  stableNoise,
} from './labs';

const tables = realTables();
const hb = tables['lab-baselines'].find((row) => row.id === 'hb');
if (!hb) throw new Error('lab-baselines 缺少 hb');

const seed = (over: Partial<Parameters<typeof seedLabs>[0]> = {}) =>
  seedLabs({
    patientId: 'p1',
    seed: 'seed-a',
    sex: 'M',
    age: 40,
    diagnosisIds: [],
    state: 'DETERIORATING',
    tables,
    t: 0,
    ...over,
  });

describe('化驗基準值', () => {
  it('每項化驗都有起始值，數值落在參考範圍附近', () => {
    const labs = seed();
    expect(Object.keys(labs)).toHaveLength(tables['lab-baselines'].length);
    for (const row of tables['lab-baselines']) {
      const reading = labs[row.id];
      expect(reading, row.id).toBeDefined();
      const typical = normalValue(row, 'M', 40);
      // 四捨五入到整數嘅項目（例如 Na 140）相對偏差會大一點，所以加半步容差。
      const halfStep = 0.5 * 10 ** -row.decimals;
      expect(Math.abs((reading?.value ?? 0) - typical) / typical, row.id).toBeLessThanOrEqual(
        LAB_SEED_SPREAD + halfStep / typical + 0.001,
      );
    }
  });

  it('男女同長者基準唔同：血紅素女低過男，長者再低', () => {
    expect(hb.typical.F).toBeLessThan(hb.typical.M);
    expect(normalValue(hb, 'M', 80)).toBeLessThan(normalValue(hb, 'M', 40));
    expect(normalValue(hb, 'F', 40)).toBeLessThan(normalValue(hb, 'M', 40));
  });

  it('同一個 seed 重播結果一樣；唔同 seed 有差異', () => {
    expect(seed()).toEqual(seed());
    expect(seed({ seed: 'seed-b' })).not.toEqual(seed());
  });

  it('診斷有指定值就用診斷值，唔用正常基準', () => {
    const bleeding = seed({ diagnosisIds: ['gi-bleed'] });
    expect(bleeding.hb?.value).toBeLessThan(normalValue(hb, 'M', 40));
    expect(bleeding.hb?.value).toBeGreaterThan(7);
  });

  it('同一個診斷，穩定同惡化嘅血紅素唔同', () => {
    const bad = seed({ diagnosisIds: ['gi-bleed'], state: 'DETERIORATING' });
    const better = seed({ diagnosisIds: ['gi-bleed'], state: 'STABILISING' });
    expect(better.hb?.value ?? 0).toBeGreaterThan(bad.hb?.value ?? 0);
  });

  it('同診斷無關嘅項目用正常基準，唔會被病情拉低', () => {
    const bleeding = seed({ diagnosisIds: ['gi-bleed'] });
    const well = seed();
    expect(bleeding.amylase?.value).toBe(well.amylase?.value);
  });
});

describe('重複檢查', () => {
  const reading = { value: 14.8, at: 0 };

  it('每次重複檢查只有小變動，改動幅度細過 1%', () => {
    const first = readingForReport(reading, 1, 'seed|p1|hb|order-1');
    const second = readingForReport(reading, 1, 'seed|p1|hb|order-2');
    expect(Math.abs(first - reading.value) / reading.value).toBeLessThanOrEqual(
      LAB_REPEAT_SPREAD + 0.001,
    );
    expect(Math.abs(second - first)).toBeLessThanOrEqual(reading.value * 0.02);
  });

  it('重複檢查唔會累積：儲存值本身唔變', () => {
    readingForReport(reading, 1, 'a');
    readingForReport(reading, 1, 'b');
    expect(reading.value).toBe(14.8);
  });

  it('噪音喺上下限之內', () => {
    for (let i = 0; i < 200; i += 1) {
      const noise = stableNoise(`key-${i}`, 0.02);
      expect(Math.abs(noise)).toBeLessThanOrEqual(0.02);
    }
  });
});

describe('診斷值解析', () => {
  it('診斷＋狀態優先於診斷的 *', () => {
    const byDiagnosis = { 'gi-bleed': { DETERIORATING: 7.6, '*': 9.2 } };
    expect(diagnosisBase(byDiagnosis, ['gi-bleed'], 'DETERIORATING')).toBe(7.6);
    expect(diagnosisBase(byDiagnosis, ['gi-bleed'], 'STABILISING')).toBe(9.2);
  });

  it('診斷冇寫過就回 undefined，交由正常基準決定', () => {
    expect(diagnosisBase({ 'gi-bleed': { '*': 9 } }, ['sepsis'], 'DETERIORATING')).toBeUndefined();
    expect(diagnosisBase(undefined, ['sepsis'], 'DETERIORATING')).toBeUndefined();
  });
});

describe('介入對化驗值的影響', () => {
  const effects = realTables()['lab-effects'];
  const transfusion = effects.filter((row) => row.flag === 'transfusion.prc');
  const base = { value: 7.6, at: 0 };

  const valueAt = (t: number, flags: string[] = []) => {
    const modifiers = modifiersForFlags(transfusion, ['transfusion.prc'], 0);
    return labValueAt(base, modifiers, 'hb', 1, t, flags);
  };

  it('輸血一包令 Hb 升 1.0，受上限 9.0 限制', () => {
    expect(valueAt(0)).toBe(8.6);
    const many = [
      ...modifiersForFlags(transfusion, ['transfusion.prc'], 0),
      ...modifiersForFlags(transfusion, ['transfusion.prc'], 0),
    ];
    expect(labValueAt(base, many, 'hb', 1, 0, [])).toBe(9);
  });

  it('未止血時每兩小時回跌 0.3', () => {
    expect(valueAt(2 * 3600)).toBe(8.3);
    expect(valueAt(4 * 3600)).toBe(8);
  });

  it('回跌最多扣到原本嘅值，唔會反過來拉低', () => {
    expect(valueAt(100 * 3600)).toBe(7.6);
  });

  it('有 bleeding.stopped 旗標就唔再回跌', () => {
    expect(valueAt(4 * 3600, ['bleeding.stopped'])).toBe(8.6);
  });

  it('沒有輸血就沒有修飾', () => {
    expect(
      labValueAt(base, modifiersForFlags(transfusion, ['fluid.bolus'], 0), 'hb', 1, 0, []),
    ).toBe(7.6);
  });

  it('補液令 Hb 略降、乳酸下降', () => {
    const modifiers = modifiersForFlags(effects, ['fluid.bolus'], 0);
    expect(labValueAt({ value: 8, at: 0 }, modifiers, 'hb', 1, 0, [])).toBe(7.6);
    expect(labValueAt({ value: 4.2, at: 0 }, modifiers, 'lactate', 1, 0, [])).toBe(3.4);
  });

  it('胰島素令鉀下降，四小時後回彈', () => {
    const modifiers = modifiersForFlags(effects, ['insulin.iv'], 0);
    expect(labValueAt({ value: 6.2, at: 0 }, modifiers, 'k', 1, 0, [])).toBe(5.2);
    expect(labValueAt({ value: 6.2, at: 0 }, modifiers, 'k', 1, 4 * 3600, [])).toBe(6.2);
  });
});
