import { describe, expect, it } from 'vitest';
import { DEATH_STEP_IDS } from '../case/tables';
import { subscoreSum } from '../score/scoring';
import {
  completeStep,
  config,
  give,
  onlyDeath,
  start,
  untilArrest,
  wait,
  type Session,
} from '../acls/kit';

function died(seed = 'death-1', rank: 'HO' | 'MO' | 'RES' = 'MO', caseId = 'terminal-01'): Session {
  let s = untilArrest(start(seed, caseId, { playerRank: rank }));
  s = give(s, 'cpr', 10);
  for (let i = 0; i < config.acls.minCyclesBeforeStop; i += 1) s = give(s, 'rhythm check', 15);
  return give(s, 'stop cpr', 10);
}

const delayEntries = (s: Session) =>
  s.state.scoreLedger.filter((e) => e.rule === 'DEATH_PROCESS_DELAY');

describe('死亡流程', () => {
  it('宣佈死亡：開始四步流程、扣死亡分、病人／床位仍然佔用', () => {
    const s = died();
    expect(onlyDeath(s.state)?.status).toBe('PENDING_PROCESS');
    expect(Object.keys(onlyDeath(s.state)?.steps ?? {}).sort()).toEqual([...DEATH_STEP_IDS].sort());
    expect(s.state.scoreLedger.some((e) => e.rule === 'PATIENT_DEATH' && e.delta < 0)).toBe(true);
    expect(s.state.patients.p1).toBeDefined();
  });

  it('未完成：床位唔釋放，並持續扣「流程拖延」分', () => {
    let s = died();
    const t0 = subscoreSum(s.state, 'CLINICAL_OUTCOME');
    s = wait(s, 1200);
    expect(s.state.patients.p1).toBeDefined();
    expect(onlyDeath(s.state)?.completedAt).toBeNull();
    expect(onlyDeath(s.state)?.status).toBe('PENDING_PROCESS');
    expect(delayEntries(s).length).toBeGreaterThanOrEqual(3);
    expect(onlyDeath(s.state)?.delayCharges).toBe(delayEntries(s).length);
    expect(subscoreSum(s.state, 'CLINICAL_OUTCOME')).toBeLessThan(t0);
  });

  it('完成三步仍然未釋放、仍然扣分；第四步完成先釋放並停止扣分', () => {
    let s = died();
    for (const step of DEATH_STEP_IDS.slice(0, 3)) s = completeStep(s, step);
    expect(onlyDeath(s.state)?.status).toBe('PENDING_PROCESS');
    const before = delayEntries(s).length;
    s = wait(s, 900);
    expect(delayEntries(s).length).toBeGreaterThan(before);

    s = completeStep(s, DEATH_STEP_IDS[3]);
    expect(onlyDeath(s.state)?.status).toBe('COMPLETE');
    expect(onlyDeath(s.state)?.completedAt).not.toBeNull();
    const frozen = delayEntries(s).length;
    s = wait(s, 2400);
    expect(delayEntries(s).length).toBe(frozen);
  });

  it('重複確認同一步、未知步驟：冇副作用', () => {
    let s = died();
    s = completeStep(s, 'CERTIFICATE');
    const snapshot = JSON.stringify(onlyDeath(s.state));
    s = completeStep(s, 'CERTIFICATE');
    expect(JSON.stringify(onlyDeath(s.state))).toBe(snapshot);
    s = completeStep(s, 'NOT_A_STEP');
    expect(JSON.stringify(onlyDeath(s.state))).toBe(snapshot);
  });

  it('通知對象 ＝ 上一級（HO→MO、MO→RES、RES→AC）', () => {
    expect(onlyDeath(died('d-ho', 'HO').state)?.seniorRank).toBe('MO');
    expect(onlyDeath(died('d-mo', 'MO').state)?.seniorRank).toBe('RES');
    expect(onlyDeath(died('d-res', 'RES').state)?.seniorRank).toBe('AC');
  });

  it('同 seed 同流程完全一樣（確定性）', () => {
    expect(JSON.stringify(died('d-det').state)).toBe(JSON.stringify(died('d-det').state));
  });
});
