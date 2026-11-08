/**
 * M9／T-E：用現有 config 跑腳本玩家。
 * 目標（Q90 B）：完全唔自我照顧，On call 34 小時內暈倒；食飯加短睡（精力低過提示門檻先瞓）可以撐到規定時間完。
 * 唔改臨床表。存檔預算用計劃入面 localStorage 約 5 MB 上限（實際存 IndexedDB）。
 */
import { describe, expect, it } from 'vitest';
import type { Engine } from '../core/reducer';
import type { GameState } from '../core/state';
import { serializeSnapshot } from '../save/snapshot';
import { advance } from '../test/realEngine';
import { plannedCallCount, shiftSeconds } from '../ward/generate';
import { selfCareAvailable, selfCareRow } from './selfCare';
import { drive, kitEngine, kitParams, shiftAct } from './shiftKit';

const H = 3600;
/** implementation-plan 儲存節：34 小時局可能超過 localStorage ~5 MB，所以先守住呢條線 */
const SAVE_BUDGET_BYTES = 5 * 1024 * 1024;

const noEnergy = { 'energy-config': [] } as const;

function careAct(engine: Engine, state: GameState) {
  if (state.shift.selfCare.active || state.shift.rounds.active) return [];
  if (state.clock.phase !== 'REGULAR') return [];
  const ctx = { config: engine.config, tables: engine.tables };
  const meal = selfCareRow(ctx, 'MEAL');
  if (meal && selfCareAvailable(state, meal, ctx)) {
    return [shiftAct('SELF_CARE_START', { actionId: 'MEAL' })];
  }
  const model = engine.tables['energy-config'][0];
  const nap = selfCareRow(ctx, 'NAP');
  if (
    model &&
    nap &&
    state.shift.energy.percent <= model.nudgeBelowPercent &&
    selfCareAvailable(state, nap, ctx)
  ) {
    return [shiftAct('SELF_CARE_START', { actionId: 'NAP' })];
  }
  return [];
}

function arrestsOf(engine: Engine, state: GameState): number {
  let count = 0;
  for (const patient of Object.values(state.patients)) {
    const template = engine.tables['case-templates'].find(
      (row) => row.id === patient.hidden.caseTemplateId,
    );
    const fsm = engine.tables['case-fsm'].find((row) => row.id === template?.fsmId);
    if (fsm?.states[patient.hidden.fsm.state]?.arrest) count += 1;
  }
  return count;
}

function deathsOf(state: GameState): number {
  return state.scoreLedger.filter((entry) => entry.rule === 'PATIENT_DEATH').length;
}

describe('M9 平衡模擬（T-E）', () => {
  it('完全唔自我照顧：日班同夜班唔會暈，On call 34 小時前暈倒，只得「暈倒」', () => {
    const engine = kitEngine();
    const day = drive(engine, engine.init(kitParams('m9-day-neglect', 'DAY')), 10 * H + 30, {
      step: 300,
    }).state;
    expect(day.clock.phase).toBe('OVERTIME');
    expect(day.shift.ending?.reason).not.toBe('FAINT');
    expect(day.shift.rounds.completed).toBe(0);
    expect(day.shift.energy.percent).toBeGreaterThan(0);

    const night = drive(engine, engine.init(kitParams('m9-night-neglect', 'NIGHT')), 14 * H + 30, {
      step: 300,
    }).state;
    expect(night.clock.phase).toBe('OVERTIME');
    expect(night.shift.ending?.reason).not.toBe('FAINT');
    expect(night.shift.rounds.completed).toBe(0);
    expect(night.shift.energy.percent).toBeGreaterThan(0);

    const onCall = drive(engine, engine.init(kitParams('m9-oncall-neglect', 'ONCALL')), 36 * H, {
      step: 600,
    }).state;
    expect(onCall.clock.phase).toBe('ENDED');
    expect(onCall.clock.t).toBeGreaterThan(24 * H);
    expect(onCall.clock.t).toBeLessThan(34 * H);
    expect(onCall.shift.ending).toMatchObject({ reason: 'FAINT', tags: ['FAINT'], forced: true });
    expect(onCall.shift.energy.percent).toBe(0);
    expect(onCall.scoreLedger.filter((entry) => entry.rule === 'OVERTIME_ENTERED')).toHaveLength(0);
    console.log(
      `M9_NEGLECT ${JSON.stringify({
        dayEnergy: day.shift.energy.percent,
        nightEnergy: night.shift.energy.percent,
        faintGameHours: Math.round((onCall.clock.t / H) * 100) / 100,
      })}`,
    );
  }, 60_000);

  it('食飯加低精力短睡可以撐完 On call 規定時間，存檔細過 5 MB', () => {
    const engine = kitEngine();
    const play = (seed: string) =>
      drive(engine, engine.init(kitParams(seed, 'ONCALL')), 34 * H + 30, {
        step: 300,
        act: (state) => careAct(engine, state),
      }).state;
    const calm = play('survive-1');
    const end = play('m9-oncall-care');
    console.log(
      `M9_MEALS ${JSON.stringify({
        calm: calm.shift.mealsTaken,
        calmEnergy: calm.shift.energy.percent,
        blocked: end.shift.mealsTaken,
        blockedEnergy: end.shift.energy.percent,
      })}`,
    );
    expect(calm.shift.ending?.reason).not.toBe('FAINT');
    expect(calm.clock.phase).toBe('OVERTIME');
    expect(calm.shift.rounds.completed).toBe(0);
    expect(calm.shift.mealsTaken).toHaveLength(3);
    expect(calm.shift.energy.percent).toBeGreaterThan(0);
    // 有心臟停頓未完結時唔可以食飯；呢個 seed 少食一餐都唔會暈
    expect(end.shift.ending?.reason).not.toBe('FAINT');
    expect(end.clock.phase).toBe('OVERTIME');
    expect(end.clock.t).toBeGreaterThanOrEqual(34 * H);
    expect(end.clock.t).toBeLessThan(34 * H + engine.config.shifts.overtimeSeconds);
    expect(end.shift.energy.percent).toBeGreaterThan(0);
    expect(end.shift.rounds.completed).toBe(0);
    expect(end.shift.mealsTaken.length).toBeGreaterThanOrEqual(2);

    const json = serializeSnapshot(end, 'm9');
    const bytes = Buffer.byteLength(json, 'utf8');
    expect(bytes).toBeLessThan(SAVE_BUDGET_BYTES);
    const chatLines = Object.values(end.chats).reduce(
      (sum, thread) => sum + thread.lines.length,
      0,
    );
    console.log(
      `M9_CARE ${JSON.stringify({
        energy: end.shift.energy.percent,
        meals: end.shift.mealsTaken.length,
        rounds: end.shift.rounds.completed,
        patients: Object.keys(end.patients).length,
        chatLines,
        actionLog: end.actionLog.length,
        pendingAi: end.pendingAi.length,
        saveBytes: bytes,
      })}`,
    );
  }, 60_000);

  it('日班跑完，來電數跟難度加成（0／+10／+20%）', () => {
    const engine = kitEngine({ ...noEnergy, 'rounds-topics': [] });
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
      const init = engine.init(kitParams(`m9-phone-${difficulty}`, 'DAY', { difficulty }));
      const uplift =
        engine.tables['difficulty-profiles'].find((row) => row.id === difficulty)
          ?.phoneVolumeUplift ?? 0;
      const expected = plannedCallCount(engine.config, 'DAY', uplift);
      expect(init.ward.plannedCalls).toBe(expected);
      expect(expected).toBe(
        Math.round(
          engine.config.phone.baseCallsPerHour *
            (shiftSeconds(engine.config, 'DAY') / H) *
            (1 + uplift),
        ),
      );
      const end = advance(engine, init, shiftSeconds(engine.config, 'DAY')).state;
      expect(end.ward.calls.filter((call) => call.direction === 'IN').length).toBe(expected);
    }
    const easy = engine.init(kitParams('m9-uplift', 'NIGHT', { difficulty: 'EASY' })).ward
      .plannedCalls;
    const medium = engine.init(kitParams('m9-uplift', 'NIGHT', { difficulty: 'MEDIUM' })).ward
      .plannedCalls;
    const hard = engine.init(kitParams('m9-uplift', 'NIGHT', { difficulty: 'HARD' })).ward
      .plannedCalls;
    expect(medium / easy).toBeCloseTo(1.1, 1);
    expect(hard / easy).toBeCloseTo(1.2, 1);
  });

  it('On call 自然病程可以跑完，同一 seed 嘅死亡／停頓數穩定', () => {
    const engine = kitEngine(noEnergy);
    const sample = (seed: string) => {
      const end = drive(engine, engine.init(kitParams(seed, 'ONCALL')), 34 * H + 30, {
        step: 600,
      }).state;
      return {
        seed,
        phase: end.clock.phase,
        t: end.clock.t,
        patients: Object.keys(end.patients).length,
        deaths: deathsOf(end),
        arrests: arrestsOf(engine, end),
      };
    };
    const seeds = ['m9-mort-1', 'm9-mort-2', 'm9-mort-3'];
    const rows = seeds.map(sample);
    for (const row of rows) {
      expect(row.phase).toBe('OVERTIME');
      expect(row.t).toBeGreaterThanOrEqual(34 * H);
      expect(row.patients).toBeGreaterThan(0);
      expect(row.deaths).toBeGreaterThanOrEqual(0);
      expect(row.arrests).toBeGreaterThanOrEqual(0);
      expect(row.arrests).toBeLessThanOrEqual(row.patients);
    }
    expect(sample('m9-mort-1')).toEqual(rows[0]);
    console.log(`M9_MORTALITY ${JSON.stringify(rows)}`);
  }, 120_000);
});
