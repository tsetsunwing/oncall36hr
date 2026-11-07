/** M7：更次結束時一次過入帳（漏做嘅必要處置、漏食用餐、結束精力）同結局標籤互相獨立。 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../core/state';
import { feed } from '../test/realEngine';
import { summariseRun } from '../score/grading';
import { drive, kitEngine, kitParams, shiftAct } from './shiftKit';

const H = 3600;
const noEnergy = { 'energy-config': [], 'rounds-topics': [] } as const;

const rulesOf = (state: GameState, prefix: string) =>
  state.scoreLedger.filter((e) => e.rule.startsWith(prefix));

function toOvertime(seed: string, extra: Parameters<typeof kitEngine>[0] = noEnergy) {
  const engine = kitEngine(extra);
  const init = engine.init(kitParams(seed, 'DAY'));
  const state = drive(engine, init, engine.config.shifts.day.regularSeconds + 1, {
    step: 300,
  }).state;
  return { engine, state };
}

describe('更次結束入帳', () => {
  it('主動交更：漏食嘅用餐窗口各記一次「自我照顧」，同一窗口唔重複', () => {
    const { engine, state } = toOvertime('end-meals');
    const handover = feed(engine, state, [shiftAct('BEGIN_HANDOVER')]).state;
    const done = feed(engine, handover, [shiftAct('HANDOVER_CONFIRM')]).state;
    const missed = rulesOf(done, 'SELF_CARE_MEAL_MISSED');
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((e) => e.subscore === 'SELF_CARE')).toBe(true);
    expect(new Set(missed.map((e) => e.evidenceRef)).size).toBe(missed.length);
  });

  it('必要處置到結束仍未做：記「時效」漏做，由 engine 事實（窗口、延遲）支持', () => {
    const { engine, state } = toOvertime('end-required');
    const done = feed(engine, feed(engine, state, [shiftAct('BEGIN_HANDOVER')]).state, [
      shiftAct('HANDOVER_CONFIRM'),
    ]).state;
    const missed = rulesOf(done, 'REQUIRED_ORDER_MISSED');
    for (const entry of missed) {
      expect(entry.subscore).toBe('TIMELINESS');
      expect(entry.evidenceRef).toMatch(/^req:/u);
      expect(Number(entry.facts.delaySec)).toBeGreaterThan(Number(entry.facts.windowSec));
    }
    expect(new Set(missed.map((e) => e.evidenceRef)).size).toBe(missed.length);
  });

  it('結束時精力偏低：記「自我照顧」；暈倒結局則唔再重複記', () => {
    const lowEnergy = kitEngine({ 'rounds-topics': [] });
    const init = lowEnergy.init(kitParams('end-faint', 'ONCALL'));
    const fainted = drive(lowEnergy, init, 36 * H, { step: 600 }).state;
    expect(fainted.shift.ending?.reason).toBe('FAINT');
    expect(rulesOf(fainted, 'SELF_CARE_ENERGY_')).toHaveLength(0);
    expect(rulesOf(fainted, 'FAINT')).toHaveLength(1);
    expect(fainted.scoreLedger.find((e) => e.rule === 'FAINT')?.subscore).toBe('SELF_CARE');
  }, 60_000);

  it('暈倒只得「暈倒」標籤，唔會同時有「超時」；超時結局亦只有「超時」', () => {
    const faintEngine = kitEngine({ 'rounds-topics': [] });
    const faint = drive(faintEngine, faintEngine.init(kitParams('tag-faint', 'ONCALL')), 36 * H, {
      step: 600,
    }).state;
    const faintSummary = summariseRun(faint, faintEngine.tables);
    expect(faintSummary.tags).toEqual(['FAINT']);
    expect(rulesOf(faint, 'OVERTIME_')).toHaveLength(0);

    const { engine, state } = toOvertime('tag-overtime');
    const forced = drive(engine, state, 7300, { step: 300 }).state;
    expect(summariseRun(forced, engine.tables).tags).toEqual(['OVERTIME']);
    expect(forced.scoreLedger.some((e) => e.rule === 'FAINT')).toBe(false);
  }, 60_000);

  it('同一局重放結果完全相同（計分唔靠計時）', () => {
    const a = toOvertime('end-replay').state;
    const b = toOvertime('end-replay').state;
    expect(a.scoreLedger).toEqual(b.scoreLedger);
  });
});
