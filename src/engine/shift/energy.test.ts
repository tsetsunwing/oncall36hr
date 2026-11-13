import { describe, expect, it } from 'vitest';
import { enqueue } from '../core/eventQueue';
import { feed, intentEvent } from '../test/realEngine';
import {
  BLADDER_ACCIDENT_SKIP_SECONDS,
  fatigueHourlyMultiplier,
  HUNGER_FATIGUE_BOOST_AT,
  HUNGER_FATIGUE_BOOST_FACTOR,
  HUNGER_FATIGUE_MAX_AT,
  HUNGER_FATIGUE_MAX_FACTOR,
} from './energy';
import { drive, kitEngine, kitParams, shiftAct } from './shiftKit';

const H = 3600;

describe('需要條速率', () => {
  it('飢餓倍率只喺 ≥70／100 先加快小時疲倦', () => {
    expect(fatigueHourlyMultiplier(69.9)).toBe(1);
    expect(fatigueHourlyMultiplier(HUNGER_FATIGUE_BOOST_AT)).toBe(HUNGER_FATIGUE_BOOST_FACTOR);
    expect(fatigueHourlyMultiplier(HUNGER_FATIGUE_MAX_AT)).toBe(HUNGER_FATIGUE_MAX_FACTOR);
  });

  it('一個遊戲小時：疲倦 +10、飢餓 +10、內急 +15；開場飢餓 30、內急 20', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('need-hour', 'DAY', { ward: false }));
    expect(init.shift.energy).toMatchObject({ fatigue: 0, hunger: 30, bladder: 20, percent: 70 });
    const hour = drive(engine, init, H, { step: 300 }).state;
    expect(hour.shift.energy.fatigue).toBeCloseTo(10, 1);
    expect(hour.shift.energy.hunger).toBeCloseTo(40, 1);
    expect(hour.shift.energy.bladder).toBeCloseTo(35, 1);
    expect(hour.shift.energy.percent).toBeCloseTo(60, 1);
  });

  it('飢餓 70% 時小時疲倦 1.5 倍；100% 時 2 倍；動作 +2% 都乘飢餓倍率', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('need-mult', 'DAY'));
    const boosted = {
      ...init,
      shift: {
        ...init.shift,
        energy: { ...init.shift.energy, hunger: 70, fatigue: 0, percent: 30 },
      },
      scheduler: enqueue(init.scheduler, { time: 1, priority: 3, kind: 'ENERGY_TICK' }),
    };
    const afterBoost = feed(engine, boosted, [{ type: 'TICK', dtRealMs: 5000 }]).state;
    expect(afterBoost.shift.energy.fatigue).toBeCloseTo(10 * (300 / 3600) * 1.5, 5);

    const maxed = {
      ...boosted,
      shift: {
        ...boosted.shift,
        energy: { ...boosted.shift.energy, hunger: 100, fatigue: 0, percent: 0 },
      },
    };
    const afterMax = feed(engine, maxed, [{ type: 'TICK', dtRealMs: 5000 }]);
    expect(afterMax.state.shift.ending?.reason).toBe('FAINT');

    const bed = Object.values(init.patients)[0]?.bed ?? 1;
    const clicked = feed(engine, init, [
      intentEvent({ type: 'EXTENSION', module: 'ward', name: 'GO_TO_BED', payload: { bed } }),
    ]).state;
    expect(clicked.shift.energy.fatigue).toBe(2);

    const hungry = {
      ...init,
      shift: {
        ...init.shift,
        energy: { ...init.shift.energy, hunger: 70, fatigue: 0, percent: 30 },
      },
    };
    const hungryClick = feed(engine, hungry, [
      intentEvent({ type: 'EXTENSION', module: 'ward', name: 'GO_TO_BED', payload: { bed } }),
    ]).state;
    expect(hungryClick.shift.energy.fatigue).toBe(3);
  });

  it('內急到 100% 失禁：跳 1 小時、寫行動記錄、內急歸零，唔結束當值', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('bladder-accident', 'DAY', { ward: false }));
    const primed = {
      ...init,
      shift: {
        ...init.shift,
        energy: { ...init.shift.energy, bladder: 99.9, percent: init.shift.energy.percent },
      },
      scheduler: enqueue(init.scheduler, { time: 1, priority: 3, kind: 'ENERGY_TICK' }),
    };
    const run = feed(engine, primed, [{ type: 'TICK', dtRealMs: 5000 }]);
    expect(run.state.clock.phase).not.toBe('ENDED');
    expect(run.state.shift.ending).toBeNull();
    expect(run.state.clock.t).toBeGreaterThanOrEqual(1 + BLADDER_ACCIDENT_SKIP_SECONDS);
    expect(run.state.shift.energy.bladder).toBeLessThan(100);
    expect(run.state.shift.energy.fatigue).toBeGreaterThan(init.shift.energy.fatigue);
    expect(run.state.actionLog.some((entry) => entry.reasonCode === 'BLADDER_ACCIDENT')).toBe(true);
    expect(run.effects).toContainEqual({ type: 'NOTICE', kind: 'BLADDER_ACCIDENT', tone: 'warn' });
  });

  it('茶水間飲水開始咖啡：2 小時內減慢疲倦、加快內急；小睡每次扣 10 分鐘先再降疲倦', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('coffee-rest', 'DAY', { ward: false }));
    const raised = {
      ...init,
      shift: {
        ...init.shift,
        energy: { ...init.shift.energy, fatigue: 40, hunger: 40, bladder: 40, percent: 60 },
      },
    };
    const pantry = feed(engine, raised, [shiftAct('ENTER_PLACE', { place: 'PANTRY' })]).state;
    expect(pantry.shift.energy.hunger).toBe(40);
    expect(pantry.shift.energy.placeAt.PANTRY).toBeNull();

    const drinking = feed(engine, pantry, [
      shiftAct('SELF_CARE_START', { actionId: 'WATER' }),
    ]).state;
    expect(drinking.shift.energy.placeAt.PANTRY).toBe(drinking.clock.t);
    const drank = drive(engine, drinking, 130, { step: 30 }).state;
    expect(drank.shift.energy.hunger).toBe(20);

    const withTick = {
      ...drank,
      scheduler: enqueue(drank.scheduler, {
        time: drank.clock.t + 1,
        priority: 3,
        kind: 'ENERGY_TICK',
      }),
    };
    const ticked = feed(engine, withTick, [{ type: 'TICK', dtRealMs: 5000 }]).state;
    const hours = 300 / 3600;
    expect(ticked.shift.energy.fatigue).toBeCloseTo(
      drank.shift.energy.fatigue + 10 * hours * 0.5,
      1,
    );
    expect(ticked.shift.energy.bladder).toBeCloseTo(
      drank.shift.energy.bladder + 15 * hours * 1.5,
      1,
    );

    const rest = feed(engine, ticked, [shiftAct('ENTER_PLACE', { place: 'REST' })]).state;
    expect(rest.clock.t).toBe(ticked.clock.t);
    expect(rest.shift.energy.fatigue).toBe(ticked.shift.energy.fatigue);
    const nap = feed(engine, rest, [shiftAct('SELF_CARE_START', { actionId: 'NAP' })]).state;
    const napped = drive(engine, nap, 650, { step: 50 }).state;
    expect(napped.clock.t).toBeGreaterThanOrEqual(ticked.clock.t + 600);
    expect(napped.shift.energy.fatigue).toBeLessThan(ticked.shift.energy.fatigue);
    const napAgain = feed(engine, napped, [shiftAct('SELF_CARE_START', { actionId: 'NAP' })]).state;
    const nappedAgain = drive(engine, napAgain, 650, { step: 50 }).state;
    expect(nappedAgain.clock.t).toBeGreaterThanOrEqual(ticked.clock.t + 1200);
    expect(nappedAgain.shift.energy.fatigue).toBeLessThan(napped.shift.energy.fatigue);
  });
});
