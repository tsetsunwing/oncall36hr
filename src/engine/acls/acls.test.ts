import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aclsModelOf } from './model';
import { beginCprSlow, endCprSlow, interruptSpeed } from '../core/clock';
import { DEATH_STEP_IDS } from '../case/tables';
import { renderTemplate } from '../chat/tokens';
import { CURRENT_SCHEMA } from '../core/state';
import type { GameState } from '../core/state';
import { feed, intentEvent } from '../test/realEngine';
import {
  config,
  give,
  onlyDeath,
  onlyResus,
  ratePerRealMs,
  standardCycle,
  start,
  untilArrest,
  wait,
} from './kit';
import type { Session } from './kit';

const SHOCK_REFUSAL =
  '醫生，而家節律係 Asystole，無脈搏，唔可以電擊，所以我唔會做 Defibrillation 600 J。';

function nurseSaid(state: GameState): string[] {
  return (state.chats.p1?.lines ?? [])
    .filter((line) => line.speaker.kind === 'NURSE')
    .map((line) => renderTemplate(line.template, line.tokenValues));
}

function showAsystole(session: Session): Session {
  const patient = session.state.patients.p1;
  if (!patient) throw new Error('缺病人');
  return {
    ...session,
    state: {
      ...session.state,
      resus: {},
      patients: {
        ...session.state.patients,
        p1: { ...patient, visible: { ...patient.visible, rhythm: 'ASYSTOLE' } },
      },
    },
  };
}

const baseRate = 60 / (config.clock.realSecondsPerGameMinuteAt1x * 1000);

describe('DNR', () => {
  it('不執行 CPR 或電擊，其他一般治療仍可下單，並可直接進入死亡流程', () => {
    let session = untilArrest(start('dnr-arrest', 'terminal-dnr-01'));
    expect(session.state.patients.p1?.demographics.code).toBe('DNR');
    session = give(session, 'cpr', 10);
    expect(onlyResus(session.state)?.cpr.firstAt).toBeNull();
    expect(session.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DNR_NO_RESUS')).toBe(
      true,
    );
    session = give(session, 'defib 200 j', 15);
    expect(onlyResus(session.state)?.shocks).toBe(0);
    const before = Object.keys(session.state.orders).length;
    session = give(session, 'oxygen nasal', 20);
    expect(Object.keys(session.state.orders).length).toBeGreaterThan(before);
    session = give(session, 'stop cpr', 10);
    expect(onlyResus(session.state)?.status).toBe('STOPPED');
    expect(onlyDeath(session.state)?.status).toBe('PENDING_PROCESS');
  });
});

describe('CPR 有效速率：固定 1/2、無視玩家倍速', () => {
  it('CPR 期間每真實毫秒推進 ＝ 1x 嘅 0.5 倍（所有倍速一樣）', () => {
    const s = untilArrest(start('rate-1', 'acs-vf-01'));
    const cpr = give(s, 'cpr', 10);
    expect(cpr.state.clock.cprSlow).toBe(true);
    expect(ratePerRealMs(cpr.state)).toBe(baseRate * config.clock.cprSlowFactor);
    expect(config.clock.cprSlowFactor).toBe(0.5);
  });

  it('property：任何玩家倍速／任何 dt，CPR 時推進嘅遊戲秒 ＝ 1x 嘅一半', () => {
    const s = give(untilArrest(start('rate-2', 'acs-vf-01')), 'cpr', 10);
    fc.assert(
      fc.property(
        fc.constantFrom(0, 1, 2, 4, 8),
        fc.integer({ min: 100, max: 4000 }),
        (speed, dt) => {
          const state = { ...s.state, clock: { ...s.state.clock, speed } };
          expect(ratePerRealMs(state)).toBeCloseTo(baseRate * 0.5, 12);
          const normal = { ...state, clock: { ...state.clock, cprSlow: false, speed: 1 } };
          expect(ratePerRealMs(state) * dt).toBeCloseTo(ratePerRealMs(normal) * dt * 0.5, 9);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('CPR 期間玩家改倍速，實際流逝時間唔變', () => {
    const s = give(untilArrest(start('rate-3', 'acs-vf-01')), 'cpr', 10);
    const sped = feed(s.engine, s.state, [intentEvent({ type: 'SET_SPEED', speed: 4 })]);
    const before = sped.state.clock.t + sped.state.clock.frac;
    const after = feed(s.engine, sped.state, [{ type: 'TICK', dtRealMs: 10_000 }]).state;
    const elapsed = after.clock.t + after.clock.frac - before;
    expect(elapsed).toBeCloseTo(10_000 * baseRate * 0.5, 6);
  });

  it('突發事件（interrupt）唔會取消 CPR 慢速；只有結束搶救先會', () => {
    const s = give(untilArrest(start('rate-4', 'acs-vf-01')), 'cpr', 10);
    const interrupted = interruptSpeed(
      { ...s.state, clock: { ...s.state.clock, speed: 4 } },
      config,
    );
    expect(interrupted.state.clock.cprSlow).toBe(true);
    expect(interrupted.state.clock.speed).toBe(config.clock.speedAfterInterrupt);
    expect(ratePerRealMs(interrupted.state)).toBe(baseRate * 0.5);

    const stillSlow = beginCprSlow(interrupted.state);
    expect(stillSlow.clock.cprSlow).toBe(true);
    const ended = endCprSlow(stillSlow, config);
    expect(ended.state.clock.cprSlow).toBe(false);
    expect(ratePerRealMs(ended.state)).toBe(baseRate * ended.state.clock.speed);
  });

  it('CPR 一開始就慢速；ROSC 之後回復正常速率', () => {
    const arrested = untilArrest(start('rate-5', 'acs-vf-01'));
    expect(arrested.state.clock.cprSlow).toBe(false);
    const slow = give(arrested, 'cpr', 10);
    expect(slow.state.clock.cprSlow).toBe(true);
  });
});

describe('ROSC 只由 engine 按 order 時機同正確程度決定', () => {
  it('AI 回覆內容唔影響搶救結果（同 seed、同 order，唔同 AI 回覆 ＝ 同一個 resus）', () => {
    const run = (ai: 'ignore' | 'cheerful') => {
      let s = untilArrest(start('rosc-ai', 'acs-vf-01'));
      s = give(s, 'cpr', 10, ai);
      s = give(s, 'rhythm check', 15, ai);
      s = give(s, 'defib 200 j', 15, ai);
      s = give(s, 'adrenaline 1 mg iv', 20, ai);
      return s.state;
    };
    const a = run('ignore');
    const b = run('cheerful');
    expect(b.resus).toEqual(a.resus);
    expect(b.rng.cpr).toEqual(a.rng.cpr);
    expect(b.clock).toEqual(a.clock);
  });

  it('同 seed 同流程：完全一樣（確定性）', () => {
    const run = () => standardCycle(untilArrest(start('rosc-det', 'acs-vf-01'))).state;
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('延遲開始 CPR 令第一次評估嘅 ROSC 機率下降（noFlow 項）', () => {
    const quick = give(
      give(untilArrest(start('rosc-delay', 'acs-vf-01')), 'cpr', 10),
      'rhythm check',
      15,
    );
    const late = give(
      give(wait(untilArrest(start('rosc-delay', 'acs-vf-01')), 400), 'cpr', 10),
      'rhythm check',
      15,
    );
    const pQuick = onlyResus(quick.state)?.lastRoll?.p ?? -1;
    const pLate = onlyResus(late.state)?.lastRoll?.p ?? -1;
    expect(pQuick).toBeGreaterThanOrEqual(0);
    expect(pLate).toBeLessThan(pQuick);
    expect(onlyResus(late.state)?.lastRoll?.terms.noFlow).toBeLessThan(0);
  });

  it('可電擊節律：電擊令機率高過漏電擊；錯能量低過正確能量', () => {
    const base = give(
      give(untilArrest(start('rosc-shock', 'acs-vf-01')), 'cpr', 10),
      'rhythm check',
      15,
    );
    const pCheck = onlyResus(base.state)?.lastRoll?.p ?? -1;
    const good = give(base, 'defib 200 j', 15);
    const wrong = give(base, 'defib 1000 j', 15);
    const pGood = onlyResus(good.state)?.lastRoll?.p ?? -1;
    const pWrong = onlyResus(wrong.state)?.lastRoll?.p ?? -1;
    expect(onlyResus(good.state)?.lastRoll?.trigger).toBe('SHOCK');
    expect(pGood).toBeGreaterThan(pCheck);
    expect(pWrong).toBeLessThan(pGood);
    expect(onlyResus(wrong.state)?.lastRoll?.terms.shock).toBeLessThan(0);
  });

  it('不可電擊節律（asystole）護士拒絕電擊，CPR 照做，200 J 常數不變', () => {
    expect(aclsModelOf(start('rosc-asy', 'terminal-01').engine.tables)?.shock.defaultEnergyJ).toBe(
      200,
    );
    let s = untilArrest(start('rosc-asy', 'terminal-01'));
    s = give(s, 'cpr', 10);
    s = give(s, 'defibrillation 600 j', 15);
    expect(onlyResus(s.state)?.status).toBe('ARREST');
    expect(onlyResus(s.state)?.cpr.state).toBe('ACTIVE');
    expect(onlyResus(s.state)?.shocks).toBe(0);
    expect(onlyResus(s.state)?.cycle.shocksOnNonShockable).toBe(0);
    const said = nurseSaid(s.state);
    expect(said.some((line) => line.includes('收到，我即刻做') && line.includes('CPR'))).toBe(true);
    expect(said.some((line) => line.includes('我唔會做') && line.includes('CPR'))).toBe(false);
    expect(said.some((line) => line.includes('心跳停搏'))).toBe(false);
    expect(said).toContain(SHOCK_REFUSAL);
    expect(
      said.some((line) => line.includes('收到，我即刻做') && line.includes('Defibrillation')),
    ).toBe(false);
  });

  it('監察儀 Asystole、無脈搏但未入搶救：CPR 要做，電擊用同一句拒絕', () => {
    const shown = showAsystole(start('monitor-asy', 'pna-sepsis-02'));
    expect(onlyResus(shown.state)).toBeUndefined();
    expect(shown.state.patients.p1?.visible.rhythm).toBe('ASYSTOLE');
    const cpr = give(shown, 'cpr', 10);
    expect(onlyResus(cpr.state)?.status).toBe('ARREST');
    expect(onlyResus(cpr.state)?.rhythm).toBe('ASYSTOLE');
    expect(onlyResus(cpr.state)?.cpr.state).toBe('ACTIVE');
    const afterCpr = nurseSaid(cpr.state);
    expect(afterCpr.some((line) => line === '收到，我即刻做 CPR。')).toBe(true);
    expect(afterCpr.some((line) => line.includes('我唔會做'))).toBe(false);
    expect(afterCpr.some((line) => line.includes('心跳停搏'))).toBe(false);

    const shocked = give(shown, 'defibrillation 600 j', 15);
    expect(onlyResus(shocked.state)?.shocks ?? 0).toBe(0);
    expect(onlyResus(shocked.state)).toBeUndefined();
    const afterShock = nurseSaid(shocked.state);
    expect(afterShock).toContain(SHOCK_REFUSAL);
    expect(afterShock.some((line) => line.includes('心跳停搏'))).toBe(false);
    expect(
      afterShock.some((line) => line.includes('收到，我即刻做') && line.includes('Defibrillation')),
    ).toBe(false);
    expect(aclsModelOf(shocked.engine.tables)?.shock.defaultEnergyJ).toBe(200);
  });

  it('不可挽救個案：ROSC 機率上限 ＝ unsalvageableCap，永遠唔會 ROSC', () => {
    const model = aclsModelOf(start('x', 'terminal-01').engine.tables);
    expect(model?.unsalvageableCap).toBe(0);
    for (const seed of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) {
      let s = untilArrest(start(seed, 'terminal-01'));
      for (let i = 0; i < 4; i += 1) s = standardCycle(s);
      expect(onlyResus(s.state)?.status).toBe('ARREST');
      expect(onlyResus(s.state)?.lastRoll?.p).toBe(0);
    }
  });

  it('標準流程喺某啲 seed 會 ROSC：CPR 慢速結束、狀態轉 ROSC、case 進入 POST_ROSC', () => {
    let found = false;
    for (let i = 0; i < 40 && !found; i += 1) {
      let s = untilArrest(start(`rosc-find-${String(i)}`, 'acs-vf-01'));
      for (let c = 0; c < 3 && onlyResus(s.state)?.status === 'ARREST'; c += 1)
        s = standardCycle(s);
      if (onlyResus(s.state)?.status !== 'ROSC') continue;
      found = true;
      expect(s.state.clock.cprSlow).toBe(false);
      expect(onlyResus(s.state)?.lastRoll?.success).toBe(true);
      expect(onlyResus(s.state)?.roscAt).not.toBeNull();
      expect(s.state.patients.p1?.hidden.fsm.state).toBe('POST_ROSC');
    }
    expect(found).toBe(true);
  });
});

describe('終止搶救同 cycle', () => {
  it('rhythm check 次數未夠 minCyclesBeforeStop，停止搶救被拒絕、冇死亡流程', () => {
    let s = untilArrest(start('stop-1', 'terminal-01'));
    s = give(give(s, 'cpr', 10), 'rhythm check', 15);
    s = give(s, 'stop cpr', 10);
    expect(onlyDeath(s.state)).toBeUndefined();
    expect(onlyResus(s.state)?.status).toBe('ARREST');
    expect(s.state.actionLog.some((l) => l.reasonCode === 'STOP_REFUSED')).toBe(true);
  });

  it('夠 cycle 數之後停止搶救 ＝ 死亡，結束 CPR 慢速', () => {
    let s = untilArrest(start('stop-2', 'terminal-01'));
    s = give(s, 'cpr', 10);
    for (let i = 0; i < config.acls.minCyclesBeforeStop; i += 1) s = give(s, 'rhythm check', 15);
    expect(onlyResus(s.state)?.cycles).toBeGreaterThanOrEqual(config.acls.minCyclesBeforeStop);
    s = give(s, 'stop cpr', 10);
    expect(onlyResus(s.state)?.status).toBe('STOPPED');
    expect(onlyDeath(s.state)?.status).toBe('PENDING_PROCESS');
    expect(s.state.clock.cprSlow).toBe(false);
  });
});

describe('H 同 T：檢查同處理', () => {
  it('做 ECG（檢查）同 alteplase（處理）會記錄喺 resus', () => {
    let s = untilArrest(start('ht-1', 'acs-vf-01'));
    s = give(s, 'cpr', 10);
    s = give(s, 'ecg', 400);
    expect(onlyResus(s.state)?.checkedCauses).toContain('cause.thrombosis');
    expect(onlyResus(s.state)?.treatedCauses).not.toContain('cause.thrombosis');
    s = give(s, 'alteplase', 200);
    expect(onlyResus(s.state)?.treatedCauses).toContain('cause.thrombosis');
  });
});

describe('存檔', () => {
  it('schema 4，resus／death／scoreLedger 預設為 null／null／[]', () => {
    const s = start('save-1', 'acs-vf-01');
    expect(s.state.schema).toBe(CURRENT_SCHEMA);
    expect(onlyResus(s.state)).toBeUndefined();
    expect(onlyDeath(s.state)).toBeUndefined();
    expect(s.state.scoreLedger).toEqual([]);
  });

  it('死亡流程步驟 id 同 death-process 表一致', () => {
    const rows = start('x', 'terminal-01').engine.tables['death-process'];
    const steps = rows.flatMap((r) => (r.kind === 'STEP' ? [r.step] : []));
    expect([...steps].sort()).toEqual([...DEATH_STEP_IDS].sort());
  });
});
