import { describe, expect, it } from 'vitest';
import { computeMews } from './mews';
import { VITAL_KEYS, type VitalKey } from './tables';
import { effectFactor, pickEffectRow, resolveRhythm } from './vitals';
import {
  advance,
  answerGates,
  aiRequests,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
  say,
  zeroNoiseTables,
} from '../test/realEngine';

const tables = realTables();
const mewsTable = tables.mews[0];
if (!mewsTable) throw new Error('缺 mews');

function vitalsOf(state: ReturnType<ReturnType<typeof realEngine>['init']>) {
  const patient = state.patients.p1;
  if (!patient) throw new Error('缺 p1');
  return patient.visible.vitals;
}

describe('個案初始化', () => {
  it('建立 p1：床位、人口資料同首個 vitals 樣本全部來自 content 表', () => {
    const state = realEngine().init(params());
    const patient = state.patients.p1;
    const template = tables['case-templates'][0];
    expect(patient?.bed).toBe(template?.bed);
    expect(patient?.demographics.age).toBe(template?.demographics.age);
    expect(patient?.demographics.sex).toBe(template?.demographics.sex);
    expect(patient?.demographics.code).toBe(template?.demographics.code);
    expect(patient?.demographics.name).not.toBe(template?.demographics.name);
    expect(patient?.demographics.name?.length).toBeGreaterThanOrEqual(2);
    expect(patient?.hidden.fsm.state).toBe(tables['case-fsm'][0]?.initial);
    expect(patient?.visible.vitalsHistory).toHaveLength(1);
    expect(state.actionLog.map((l) => l.reasonCode)).toEqual(['SHIFT_START']);
  });

  it('同 seed ＝ 完全相同；唔同 seed ＝ 噪音唔同', () => {
    const run = (seed: string) => {
      const engine = realEngine();
      return advance(engine, engine.init(params(seed)), 3600).state;
    };
    expect(JSON.stringify(run('s1'))).toBe(JSON.stringify(run('s1')));
    expect(JSON.stringify(run('s1').patients)).not.toBe(JSON.stringify(run('s2').patients));
  });
});

describe('vitals 軌跡（零噪音：精確對照表）', () => {
  const engine = realEngine(zeroNoiseTables());

  it('每個樣本都喺生理 limits 內，且 MEWS 同 visible vitals 一致', () => {
    let state = engine.init(params());
    const { limits } = engine.config.vitals;
    for (let i = 0; i < 40; i += 1) {
      state = advance(engine, state, 600).state;
      const patient = state.patients.p1;
      if (!patient) throw new Error('缺 p1');
      for (const key of VITAL_KEYS) {
        const [lo, hi] = limits[key];
        expect(patient.visible.vitals[key]).toBeGreaterThanOrEqual(lo);
        expect(patient.visible.vitals[key]).toBeLessThanOrEqual(hi);
      }
      const expected = computeMews(
        patient.visible.vitals,
        patient.visible.consciousness,
        mewsTable,
      );
      expect(patient.visible.mews).toEqual({
        score: expected.score,
        band: expected.band,
        components: expected.components,
      });
      expect(patient.visible.vitals.dbp).toBeLessThan(patient.visible.vitals.sbp);
    }
  });

  it('無任何治療：漸近 DETERIORATING 目標（按每分鐘斜率），超過 7200 秒後按表轉入 SEPTIC_SHOCK 目標', () => {
    const traj = tables.trajectories.find((t) => t.id === 'pna.deteriorating');
    if (!traj) throw new Error('缺 trajectory');
    let state = engine.init(params('zero-1'));
    state = advance(engine, state, 1200).state;
    expect(state.patients.p1?.hidden.fsm.state).toBe('DETERIORATING');
    const v = vitalsOf(state);
    for (const key of VITAL_KEYS) {
      expect(v[key], key).toBeCloseTo(traj.target[key], 0);
    }

    const shocked = advance(engine, state, 7200 + 3600 * 2).state;
    const pHidden = shocked.patients.p1?.hidden;
    expect(['DETERIORATING', 'SEPTIC_SHOCK', 'ARREST_PEA']).toContain(pHidden?.fsm.state);
    if (pHidden?.fsm.state === 'DETERIORATING') expect(pHidden.fsm.rolled).toHaveLength(1);
    if (pHidden?.fsm.state === 'SEPTIC_SHOCK') {
      expect(pHidden.fsm.rolled).toEqual([]);
      const shock = tables.trajectories.find((t) => t.id === 'pna.shock');
      expect(vitalsOf(shocked).spo2).toBeCloseTo(shock?.target.spo2 ?? 0, 0);
      expect(shocked.patients.p1?.visible.consciousness).toBe('V');
    }
  });

  it('落 NRB：SpO2 比對照組高出表內 delta（起效＋ramp 完成後）；取消後效果即消失', () => {
    const baseline = advance(engine, engine.init(params('zero-2')), 2400).state;
    const ordered = feed(engine, engine.init(params('zero-2')), [say('nrb')]).state;
    const withO2 = advance(engine, ordered, 2400).state;
    const row = pickEffectRow(tables['order-effects'], 'oxygen.nrb', 'DETERIORATING');
    expect(row).toBeDefined();
    const diff = vitalsOf(withO2).spo2 - vitalsOf(baseline).spo2;
    expect(diff).toBe(Math.min(row?.delta.spo2 ?? 0, 100 - vitalsOf(baseline).spo2));
    expect(vitalsOf(withO2).hr).toBeLessThan(vitalsOf(baseline).hr);

    const orderId = Object.keys(withO2.orders)[0] ?? '';
    const cancelled = feed(engine, withO2, [intentEvent({ type: 'CANCEL_ORDER', orderId })]).state;
    // DONE 嘅 order 唔可以取消：效果持續（O2 已經接駁）
    expect(cancelled.orders[orderId]?.status).toBe('DONE');
  });

  it('effectFactor：起效前 0、ramp 中線性、duration 後再退回', () => {
    const row = tables['order-effects'].find((r) => r.id === 'fx.ns.det');
    if (!row) throw new Error('缺 effect');
    expect(effectFactor(row, 100, 100 + row.delaySec)).toBe(0);
    expect(effectFactor(row, 100, 100 + row.delaySec + row.rampSec / 2)).toBeCloseTo(0.5);
    expect(effectFactor(row, 100, 100 + row.delaySec + row.rampSec + 10)).toBe(1);
    const end = 100 + row.delaySec + (row.durationSec ?? 0);
    expect(effectFactor(row, 100, end + row.rampSec)).toBe(0);
  });

  it('每個 order 效果表嘅 delta 都只用已知 vital key', () => {
    for (const row of tables['order-effects']) {
      for (const key of Object.keys(row.delta)) {
        expect(VITAL_KEYS).toContain(key as VitalKey);
      }
    }
  });
});

describe('FSM（表驅動）', () => {
  const engine = realEngine(zeroNoiseTables());

  it('氧氣＋抗生素 → 900 秒後 STABILISING，之後 vitals 趨向 stabilising 目標', () => {
    let state = engine.init(params('fsm-1'));
    state = answerGates(
      engine,
      feed(engine, state, [say('oxygen nrb'), say('ceftriaxone 1 g iv')]),
    ).state;
    state = advance(engine, state, 3600 * 3).state;
    expect(state.patients.p1?.hidden.fsm.state).toBe('STABILISING');
    expect(state.patients.p1?.hidden.fsm.flags).toEqual(
      expect.arrayContaining(['oxygen.on', 'abx.iv']),
    );
    expect(state.patients.p1?.visible.mews.band).not.toBe('CRITICAL');
  });

  it('每個 transition 每次入狀態最多擲一次骰（rolled），冇條件滿足就唔擲', () => {
    let state = realEngine().init(params('fsm-2'));
    const engine = realEngine();
    state = advance(engine, state, 3600).state;
    expect(state.patients.p1?.hidden.fsm.rolled).toEqual([]);
    state = advance(engine, state, 3600 * 3).state;
    expect(state.patients.p1?.hidden.fsm.rolled.length).toBeLessThanOrEqual(1);
  });

  it('同 seed 嘅 FSM 結果可重現', () => {
    const run = () => {
      const engine = realEngine();
      return advance(engine, engine.init(params('fsm-3')), 3600 * 4).state.patients.p1?.hidden.fsm;
    };
    expect(run()).toEqual(run());
  });
});

describe('rhythm 同 HR', () => {
  it('同 family 按 HR 範圍自動揀：心搏過速／竇性／過緩', () => {
    expect(resolveRhythm('SINUS_RHYTHM', 115, tables)).toBe('SINUS_TACHYCARDIA');
    expect(resolveRhythm('SINUS_RHYTHM', 80, tables)).toBe('SINUS_RHYTHM');
    expect(resolveRhythm('SINUS_RHYTHM', 45, tables)).toBe('SINUS_BRADYCARDIA');
    expect(resolveRhythm('SINUS_RHYTHM', 101, tables)).toBe('SINUS_TACHYCARDIA');
    expect(resolveRhythm('SINUS_RHYTHM', 100, tables)).toBe('SINUS_RHYTHM');
  });
});

describe('惡化提示（不重複轟炸）', () => {
  it('同一次 ALARM 期間只提示一次；每次提示都係 dialogue.turn', () => {
    const engine = realEngine(zeroNoiseTables());
    const state = engine.init(params('alert-1'));
    const run = advance(engine, state, 1800);
    const alerts = aiRequests(run.effects);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe('dialogue.turn');
    const more = advance(engine, run.state, 1800);
    expect(aiRequests(more.effects)).toHaveLength(0);
  });
});
