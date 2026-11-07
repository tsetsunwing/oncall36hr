import { describe, expect, it } from 'vitest';
import { aclsModelOf } from './model';
import { postRoscBundleDone } from './arrest';
import { give, standardCycle, start, untilArrest, wait, type Session } from './kit';

function roscSession(): Session {
  for (let i = 0; i < 60; i += 1) {
    let s = untilArrest(start(`post-rosc-${String(i)}`, 'acs-vf-01'));
    for (let c = 0; c < 3 && s.state.resus?.status === 'ARREST'; c += 1) s = standardCycle(s);
    if (s.state.resus?.status === 'ROSC') return s;
  }
  throw new Error('搵唔到 ROSC 嘅 seed');
}

const rosc = roscSession();
const model = aclsModelOf(rosc.engine.tables);
if (!model) throw new Error('缺 MODEL');

function withRng(session: Session, cpr: number): Session {
  return { ...session, state: { ...session.state, rng: { ...session.state.rng, cpr } } };
}

function finishWindow(session: Session): Session {
  return wait(session, model!.postRosc.windowSec + 60);
}

describe('ROSC 之後', () => {
  it('病人進入 POST_ROSC，觀察窗內 resus 狀態保持 ROSC，CPR 慢速已結束', () => {
    expect(rosc.state.resus?.status).toBe('ROSC');
    expect(rosc.state.resus?.postRosc?.windowEndsAt).toBe(
      (rosc.state.resus?.roscAt ?? 0) + model.postRosc.windowSec,
    );
    expect(rosc.state.clock.cprSlow).toBe(false);
    expect(rosc.state.patients.p1?.hidden.fsm.state).toBe('POST_ROSC');
  });

  it('bundle 只計 ROSC 之後完成嘅 order', () => {
    const resus = rosc.state.resus;
    if (!resus) throw new Error('缺 resus');
    const before = postRoscBundleDone(rosc.state, resus, model);
    expect(Object.values(before).every((done) => !done)).toBe(true);
    const done = give(rosc, 'ecg', 400);
    const after = postRoscBundleDone(done.state, done.state.resus ?? resus, model);
    expect(after.ecg).toBe(true);
    expect(after.abg).toBe(false);
  });

  it('觀察窗結束：要麼穩定（RECOVERED）要麼 re-arrest（新 episode），同 seed 確定', () => {
    const a = finishWindow(rosc).state.resus;
    const b = finishWindow(rosc).state.resus;
    expect(a).toEqual(b);
    expect(a?.status === 'RECOVERED' || (a?.status === 'ARREST' && a.episode === 2)).toBe(true);
  });

  it('漏做 bundle 嘅 re-arrest 比例高過做齊（200 個 rng 抽樣）', () => {
    const full = give(give(rosc, 'nrb', 80), 'ecg', 400);
    const resus = full.state.resus;
    if (!resus) throw new Error('缺 resus');
    const doneFull = postRoscBundleDone(full.state, resus, model);
    const doneNone = postRoscBundleDone(rosc.state, resus, model);
    const missing = (b: Record<string, boolean>) => Object.values(b).filter((v) => !v).length;
    expect(missing(doneFull)).toBeLessThan(missing(doneNone));

    const rate = (session: Session) => {
      let rearrests = 0;
      const runs = 200;
      for (let i = 0; i < runs; i += 1) {
        const out = finishWindow(withRng(session, 1000 + i * 7919)).state.resus;
        if (out?.status === 'ARREST') rearrests += 1;
      }
      return rearrests / runs;
    };
    expect(rate(rosc)).toBeGreaterThan(rate(full));
  });

  it('re-arrest 會重新開始 CPR 慢速流程（新 episode，CPR 未開始）', () => {
    for (let i = 0; i < 100; i += 1) {
      const out = finishWindow(withRng(rosc, 5000 + i * 104729)).state;
      if (out.resus?.status !== 'ARREST') continue;
      expect(out.resus.episode).toBe(2);
      expect(out.resus.cpr.state).toBe('NOT_STARTED');
      expect(out.patients.p1?.visible.rhythm).toBe(out.resus.rhythm);
      return;
    }
    throw new Error('冇抽到 re-arrest');
  });
});
