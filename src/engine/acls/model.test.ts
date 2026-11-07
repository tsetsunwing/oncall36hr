import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { realTables } from '../test/realEngine';
import {
  aclsModelOf,
  aclsRhythmRowOf,
  computeRoscProbability,
  doseMatches,
  energyInRange,
  rhythmOf,
  type RoscInputs,
} from './model';
import type { Resus } from './resusState';
import { start, untilArrest } from './kit';

const tables = realTables();
const model = aclsModelOf(tables);
if (!model) throw new Error('缺 acls MODEL');
const arrest = untilArrest(start('model-base', 'acs-vf-01')).state.resus;
if (!arrest) throw new Error('缺 resus');

const SHOCKABLE = ['VENTRICULAR_FIBRILLATION', 'PULSELESS_VT', 'TORSADES_DE_POINTES'];
const NON_SHOCKABLE = ['PULSELESS_ELECTRICAL_ACTIVITY', 'ASYSTOLE'];

function inputs(resus: Resus, overrides: Partial<RoscInputs> = {}): RoscInputs {
  const rhythmRow = aclsRhythmRowOf(tables, resus.rhythm);
  const rhythm = rhythmOf(tables, resus.rhythm);
  if (!rhythmRow || !rhythm || !model) throw new Error('缺節律表');
  return {
    resus,
    rhythmRow,
    rhythm,
    model,
    now: resus.onsetAt + 600,
    salvageable: true,
    airwaySecured: false,
    ...overrides,
  };
}

const p = (resus: Resus, overrides: Partial<RoscInputs> = {}) =>
  computeRoscProbability(inputs(resus, overrides)).p;

const resusArb = (rhythms: readonly string[]) =>
  fc
    .record({
      rhythm: fc.constantFrom(...rhythms),
      noFlowSec: fc.integer({ min: 0, max: 900 }),
      handsOffSec: fc.integer({ min: 0, max: 400 }),
      cycles: fc.integer({ min: 0, max: 12 }),
      shocks: fc.integer({ min: 0, max: 6 }),
      firstShockableAt: fc.integer({ min: 0, max: 200 }),
      delay: fc.integer({ min: 0, max: 900 }),
      shocksOnShockable: fc.integer({ min: 0, max: 2 }),
      shocksOnNonShockable: fc.integer({ min: 0, max: 3 }),
      wrongEnergy: fc.boolean(),
    })
    .map((g): Resus => ({
      ...arrest,
      rhythm: g.rhythm,
      noFlowSec: g.noFlowSec,
      handsOffSec: g.handsOffSec,
      cycles: g.cycles,
      shocks: g.shocks,
      firstShockableAt: g.firstShockableAt,
      firstShockAt: g.firstShockableAt + g.delay,
      cycle: {
        shocksOnShockable: g.shocksOnShockable,
        shocksOnNonShockable: g.shocksOnNonShockable,
        wrongEnergy: g.wrongEnergy,
        drugs: [],
      },
    }));

const anyResus = resusArb([...SHOCKABLE, ...NON_SHOCKABLE]);
const shockableResus = resusArb(SHOCKABLE);

describe('ROSC 機率模型：性質', () => {
  it('機率永遠喺 [rosc.min, rosc.max]', () => {
    fc.assert(
      fc.property(anyResus, (r) => {
        const value = p(r);
        expect(value).toBeGreaterThanOrEqual(model.rosc.min);
        expect(value).toBeLessThanOrEqual(model.rosc.max);
      }),
    );
  });

  it('不可挽救個案：機率 ≤ unsalvageableCap', () => {
    fc.assert(
      fc.property(anyResus, (r) => {
        expect(p(r, { salvageable: false })).toBeLessThanOrEqual(model.unsalvageableCap);
      }),
    );
  });

  it('無血流時間愈長，機率只會下降或不變', () => {
    fc.assert(
      fc.property(anyResus, fc.integer({ min: 1, max: 600 }), (r, extra) => {
        expect(p({ ...r, noFlowSec: r.noFlowSec + extra })).toBeLessThanOrEqual(p(r));
      }),
    );
  });

  it('hands-off 時間愈長，機率只會下降或不變', () => {
    fc.assert(
      fc.property(anyResus, fc.integer({ min: 1, max: 300 }), (r, extra) => {
        expect(p({ ...r, handsOffSec: r.handsOffSec + extra })).toBeLessThanOrEqual(p(r));
      }),
    );
  });

  it('搶救愈拖愈多 cycle，機率只會下降或不變', () => {
    fc.assert(
      fc.property(anyResus, fc.integer({ min: 1, max: 8 }), (r, extra) => {
        expect(p({ ...r, cycles: r.cycles + extra })).toBeLessThanOrEqual(p(r));
      }),
    );
  });

  it('可電擊節律：第一次電擊愈遲，機率只會下降或不變', () => {
    fc.assert(
      fc.property(shockableResus, fc.integer({ min: 1, max: 600 }), (r, extra) => {
        const later = { ...r, firstShockAt: (r.firstShockAt ?? 0) + extra };
        expect(p(later)).toBeLessThanOrEqual(p(r));
      }),
    );
  });

  it('可電擊節律：有電擊 ≥ 漏電擊；正確能量 ≥ 錯能量', () => {
    fc.assert(
      fc.property(shockableResus, (r) => {
        const missed = { ...r, cycle: { ...r.cycle, shocksOnShockable: 0 } };
        const right = {
          ...r,
          cycle: { ...r.cycle, shocksOnShockable: 1, wrongEnergy: false },
        };
        const wrong = { ...right, cycle: { ...right.cycle, wrongEnergy: true } };
        expect(p(right)).toBeGreaterThanOrEqual(p(wrong));
        expect(p(right)).toBeGreaterThanOrEqual(p(missed));
      }),
    );
  });

  it('不可電擊節律：不適當電擊愈多，機率只會下降或不變', () => {
    fc.assert(
      fc.property(resusArb(NON_SHOCKABLE), (r) => {
        const more = {
          ...r,
          cycle: { ...r.cycle, shocksOnNonShockable: r.cycle.shocksOnNonShockable + 1 },
        };
        expect(p(more)).toBeLessThanOrEqual(p(r));
      }),
    );
  });

  it('錯劑量 ≤ 正確劑量 ≤（冇用藥 +bonus）：adrenaline 劑量錯唔會高過正確', () => {
    const rule = model.drugs.find((d) => d.formularyId === 'adrenaline');
    if (!rule) throw new Error('缺 adrenaline 規則');
    fc.assert(
      fc.property(shockableResus, (r) => {
        const base = { ...r, shocks: Math.max(r.shocks, rule.minShocksBefore) };
        const given = (doseOk: boolean): Resus => ({
          ...base,
          cycle: {
            ...base.cycle,
            drugs: [{ formularyId: 'adrenaline', dose: rule.dose, at: 0, doseOk }],
          },
        });
        expect(p(given(false))).toBeLessThanOrEqual(p(given(true)));
        expect(p(given(false))).toBeLessThanOrEqual(p(base));
      }),
    );
  });

  it('處理真正存在嘅可逆病因 ≥ 冇處理；處理唔存在嘅病因冇影響', () => {
    fc.assert(
      fc.property(anyResus, (r) => {
        const withCause = { ...r, causeIds: ['cause.thrombosis'] };
        const treated = { ...withCause, treatedCauses: ['cause.thrombosis'] };
        const irrelevant = { ...withCause, treatedCauses: ['cause.tamponade'] };
        expect(p(treated)).toBeGreaterThanOrEqual(p(withCause));
        expect(p(irrelevant)).toBe(p(withCause));
      }),
    );
  });

  it('氣道已確保 ≥ 未確保', () => {
    fc.assert(
      fc.property(anyResus, (r) => {
        expect(p(r, { airwaySecured: true })).toBeGreaterThanOrEqual(p(r));
      }),
    );
  });

  it('同一輸入 → 同一機率（純函數）', () => {
    fc.assert(
      fc.property(anyResus, (r) => {
        expect(computeRoscProbability(inputs(r))).toEqual(computeRoscProbability(inputs(r)));
      }),
    );
  });
});

describe('輔助判斷', () => {
  it('劑量：缺省＝預設；g／mg 互換；單位唔同系列＝錯', () => {
    const rule = { value: 1, unit: 'mg' };
    expect(doseMatches(null, rule)).toBe(true);
    expect(doseMatches({ value: 1, unit: 'mg' }, rule)).toBe(true);
    expect(doseMatches({ value: 0.001, unit: 'g' }, rule)).toBe(true);
    expect(doseMatches({ value: 10, unit: 'mg' }, rule)).toBe(false);
    expect(doseMatches({ value: 1, unit: 'ml' }, rule)).toBe(false);
  });

  it('能量範圍', () => {
    expect(energyInRange(model.shock.defaultEnergyJ, model)).toBe(true);
    expect(energyInRange(model.shock.maxEnergyJ + 1, model)).toBe(false);
    expect(energyInRange(model.shock.minEnergyJ - 1, model)).toBe(false);
  });

  it('節律可電擊標記同 acls 表一致：可電擊節律都有 ifShocked 轉移', () => {
    for (const id of [...SHOCKABLE, ...NON_SHOCKABLE]) {
      expect(rhythmOf(tables, id)?.shockable).toBe(SHOCKABLE.includes(id));
      expect(aclsRhythmRowOf(tables, id)).toBeDefined();
    }
  });
});
