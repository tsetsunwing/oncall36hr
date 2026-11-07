import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { evaluateFsm } from '../case/fsm';
import { enqueue } from '../core/eventQueue';
import type { Effect } from '../core/events';
import type { GameState } from '../core/state';
import { feed, fullTables, intentEvent, say } from '../test/realEngine';
import { gameSecondsPerRealMs } from '../core/clock';
import { createEngine } from '../core/reducer';
import { answerRoundAi, drive, kitEngine, kitParams, shiftAct } from './shiftKit';

const H = 3600;

const noEnergy = { 'energy-config': [] } as const;

function ledgerOf(state: GameState, rule: string) {
  return state.ward.ledger.filter((e) => e.rule === rule);
}

describe('更次生成（init）', () => {
  it('開局排好 SHIFT_END、巡房事件同精力 tick，精力由 T20 起始值', () => {
    const engine = kitEngine();
    const state = engine.init(kitParams('shift-init', 'ONCALL'));
    const kinds = state.scheduler.items.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'ROUND_START')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'SHIFT_END')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'ENERGY_TICK')).toHaveLength(1);
    expect(state.shift.energy.percent).toBe(getContent().tables['energy-config'][0]?.startPercent);
    expect(state.clock.phase).toBe('REGULAR');
  });
});

describe('巡房（§8）', () => {
  it('On call 實際跑完 34 小時：剛好四次巡房，每次由 AC 主持、每個病人最多問一次', () => {
    const engine = kitEngine(noEnergy);
    const init = engine.init(kitParams('rounds-oncall', 'ONCALL'));
    const end = drive(engine, init, 34 * H + 60, { step: 120 });
    expect(end.state.shift.rounds.started).toBe(4);
    expect(end.state.shift.rounds.completed).toBe(4);
    expect(end.state.shift.rounds.history.map((r) => r.number)).toEqual([1, 2, 3, 4]);
    for (const round of end.state.shift.rounds.history) {
      const ids = round.results.map((r) => r.patientId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('日班兩次、夜班零次', () => {
    const day = kitEngine(noEnergy);
    const dayEnd = drive(day, day.init(kitParams('rounds-day', 'DAY')), 10 * H, { step: 120 });
    expect(dayEnd.state.shift.rounds.completed).toBe(2);
    const night = kitEngine(noEnergy);
    const nightEnd = drive(night, night.init(kitParams('rounds-night', 'NIGHT')), 14 * H, {
      step: 300,
    });
    expect(nightEnd.state.shift.rounds.started).toBe(0);
  }, 60_000);

  it('巡房期間冇電話、冇護士惡化提示、冇心臟停頓（多個 seed、困難模式）', () => {
    for (const seed of ['quiet-1', 'quiet-2', 'quiet-3', 'quiet-4']) {
      const engine = kitEngine(noEnergy);
      const init = engine.init(kitParams(seed, 'DAY', { difficulty: 'HARD' }));
      const alerts: { t: number }[] = [];
      let roundActive = false;
      const end = drive(engine, init, 10 * H, {
        step: 60,
        onStep(state, effects) {
          const wholeStepInRound = roundActive && state.shift.rounds.active !== null;
          roundActive = state.shift.rounds.active !== null;
          if (!wholeStepInRound) return;
          for (const e of effects as Effect[]) {
            if (e.type !== 'AI_REQUEST' || e.kind !== 'dialogue.turn') continue;
            const beats = (e.context as { prompt: { beats: { type: string }[] } }).prompt.beats;
            if (
              beats.some((b) => b.type === 'ALERT_DETERIORATION' || b.type === 'ARREST_ANNOUNCED')
            ) {
              alerts.push({ t: state.clock.t });
            }
          }
        },
      });
      expect(alerts, seed).toEqual([]);
      const windows = end.state.shift.rounds.history.map((r) => [r.startedAt, r.endedAt] as const);
      expect(windows.length).toBe(2);
      for (const [from, to] of windows) {
        for (const call of end.state.ward.calls) {
          expect(call.arrivedAt >= from && call.arrivedAt < to, `${seed} call ${call.id}`).toBe(
            false,
          );
        }
        const onset = end.state.resus?.onsetAt;
        if (onset !== undefined) expect(onset >= from && onset < to, `${seed} arrest`).toBe(false);
      }
    }
  }, 120_000);

  it('FSM 嘅心臟停頓轉移喺巡房期間被攔，唔擲骰、唔標記，之後照常評估', () => {
    const tables = fullTables();
    const fsm = tables['case-fsm'].find((f) =>
      Object.values(f.states).some((s) => s.arrest !== undefined),
    );
    expect(fsm).toBeDefined();
    if (!fsm) return;
    const engine = kitEngine();
    const base = engine.init(kitParams('fsm-block', 'DAY', { ward: false }));
    const patient = Object.values(base.patients)[0];
    if (!patient) throw new Error('no patient');
    const arrestStates = Object.entries(fsm.states)
      .filter(([, s]) => s.arrest)
      .map(([id]) => id);
    const transition = fsm.transitions.find((tr) => arrestStates.includes(tr.to));
    expect(transition).toBeDefined();
    if (!transition) return;
    const at = {
      ...patient,
      hidden: {
        ...patient.hidden,
        fsm: { ...patient.hidden.fsm, state: transition.from, rolled: [] },
      },
    };
    const blocked = evaluateFsm(at, fsm, 10_000_000, base.rng, { blockArrest: true });
    expect(arrestStates).not.toContain(blocked.patient.hidden.fsm.state);
    expect(blocked.patient.hidden.fsm.rolled).not.toContain(fsm.transitions.indexOf(transition));
    expect(blocked.rng).toEqual(base.rng);
  });

  it('巡房流程：答對入分（臨床結果）、揭曉 T25 key facts、再入下一個病人', () => {
    const engine = kitEngine(noEnergy);
    let state = engine.init(kitParams('round-flow', 'DAY', { ward: false }));
    state = drive(engine, state, 1 * H + 5).state;
    const active = state.shift.rounds.active;
    expect(active?.current?.phase).toBe('ASKING');
    expect(active?.current?.hints).toHaveLength(3);
    const answered = feed(engine, state, [shiftAct('ROUND_ANSWER', { text: '肺炎常見咳嗽' })]);
    expect(answered.state.shift.rounds.active?.current?.phase).toBe('GRADING');
    const grade = answered.effects.find(
      (e) => e.type === 'AI_REQUEST' && e.kind === 'rounds.grade',
    );
    expect(grade).toBeDefined();
    const factId = (grade as unknown as { context: { prompt: { keyFacts: { id: string }[] } } })
      .context.prompt.keyFacts[0]?.id;
    const graded = feed(engine, answered.state, [
      {
        type: 'AI_RESULT',
        reqId: (grade as { reqId: string }).reqId,
        payload: { verdict: 'CORRECT', matchedKeyFacts: [factId ?? ''], seniorLine: '啱喇' },
      },
    ]);
    const current = graded.state.shift.rounds.active?.current;
    expect(current?.phase).toBe('REVEAL');
    expect(current?.verdict).toBe('CORRECT');
    expect(current?.seniorLine).toBe('啱喇');
    expect(ledgerOf(graded.state, 'ROUND_CORRECT')).toHaveLength(1);
    const next = feed(engine, graded.state, [shiftAct('ROUND_NEXT')]);
    expect(next.state.shift.rounds.active).toBeNull();
    expect(next.state.shift.rounds.completed).toBe(1);
  });

  it('AI 評分只可以引用 T25 key facts：虛構 id 被拒（AI 失敗暫停），空命中降為答錯', () => {
    const engine = kitEngine(noEnergy);
    let state = engine.init(kitParams('round-guard', 'DAY', { ward: false }));
    state = drive(engine, state, 1 * H + 5).state;
    const answered = feed(engine, state, [shiftAct('ROUND_ANSWER', { text: '唔知' })]);
    const reqId = answered.state.shift.rounds.active?.current?.requestId ?? '';
    const forged = feed(engine, answered.state, [
      {
        type: 'AI_RESULT',
        reqId,
        payload: { verdict: 'CORRECT', matchedKeyFacts: ['made-up-fact'] },
      },
    ]);
    expect(forged.state.pendingAi.some((p) => p.reqId === reqId)).toBe(true);
    expect(forged.state.shift.rounds.active?.current?.phase).toBe('GRADING');
    expect(ledgerOf(forged.state, 'ROUND_CORRECT')).toHaveLength(0);

    const empty = feed(engine, answered.state, [
      { type: 'AI_RESULT', reqId, payload: { verdict: 'CORRECT', matchedKeyFacts: [] } },
    ]);
    expect(empty.state.shift.rounds.active?.current?.verdict).toBe('WRONG');
    expect(ledgerOf(empty.state, 'ROUND_WRONG')).toHaveLength(1);
  });

  it('題目含數字被拒；超時冇作答記 ROUND_UNANSWERED；「唔識」記答錯', () => {
    const engine = kitEngine(noEnergy);
    let state = engine.init(kitParams('round-misc', 'DAY', { ward: false }));
    const toRound = drive(engine, state, 1 * H, { mode: 'question-only', step: 60 }).state;
    expect(toRound.shift.rounds.active).not.toBeNull();
    state = toRound;
    const pending = state.pendingAi.find((p) => p.kind === 'rounds.question');
    expect(pending).toBeUndefined();

    const asking = drive(engine, state, 5).state;
    const passed = feed(engine, asking, [shiftAct('ROUND_PASS')]);
    expect(ledgerOf(passed.state, 'ROUND_WRONG')).toHaveLength(1);

    const timedOut = drive(engine, asking, engine.config.rounds.questionSeconds + 5).state;
    expect(ledgerOf(timedOut, 'ROUND_UNANSWERED').length).toBeGreaterThanOrEqual(1);
  });

  it('巡房等 AI 期間時鐘自動暫停（C1），題目回覆後先倒數；作答評分期間亦暫停', () => {
    const base = kitEngine(noEnergy);
    const engine = createEngine(
      { ...base.config, clock: { ...base.config.clock, pauseWhileAiPending: true } },
      { tables: base.tables },
    );
    const rate = gameSecondsPerRealMs(
      engine.config,
      engine.init(kitParams('c1', 'DAY', { ward: false })),
    );
    let state: GameState = {
      ...engine.init(kitParams('c1', 'DAY', { ward: false })),
      pendingAi: [],
    };
    const dropOtherAi = (st: GameState): GameState => ({
      ...st,
      pendingAi: st.pendingAi.filter((p) => p.kind.startsWith('rounds.')),
    });
    while (state.clock.t < 1 * H && gameSecondsPerRealMs(engine.config, state) > 0) {
      state = dropOtherAi(
        feed(engine, dropOtherAi(state), [{ type: 'TICK', dtRealMs: 60_000 / rate }]).state,
      );
    }
    expect(state.clock.t).toBe(1 * H);
    expect(state.shift.rounds.active?.current?.phase).toBe('LOADING');
    const stalled = feed(engine, state, [{ type: 'TICK', dtRealMs: 600_000 }]).state;
    expect(stalled.clock.t).toBe(1 * H);

    const answeredQuestion = answerRoundAi(engine, {
      state: stalled,
      effects: [
        {
          type: 'AI_REQUEST',
          reqId: stalled.pendingAi[0]?.reqId ?? '',
          kind: 'rounds.question',
          context: stalled.pendingAi[0]?.context ?? null,
        },
      ],
    }).state;
    expect(answeredQuestion.shift.rounds.active?.current?.phase).toBe('ASKING');
    const running = feed(engine, answeredQuestion, [{ type: 'TICK', dtRealMs: 5000 }]).state;
    expect(running.clock.t).toBeGreaterThan(1 * H);
    const grading = feed(engine, running, [shiftAct('ROUND_ANSWER', { text: '肺炎' })]).state;
    const frozen = feed(engine, grading, [{ type: 'TICK', dtRealMs: 60_000 }]).state;
    expect(frozen.clock.t).toBe(grading.clock.t);
  });
});

describe('超時與強制交更（§2.1）', () => {
  function toOvertime(seed: string, mode: 'DAY' | 'NIGHT' | 'ONCALL' = 'DAY') {
    const engine = kitEngine({ ...noEnergy, 'rounds-topics': [] });
    const init = engine.init(kitParams(seed, mode));
    const length =
      engine.config.shifts[mode === 'ONCALL' ? 'onCall' : mode === 'DAY' ? 'day' : 'night']
        .regularSeconds;
    const state = drive(engine, init, length + 1, { step: 300 }).state;
    return { engine, state, length };
  }

  it('規定時間一到進入 OVERTIME，排好 2 小時後嘅強制交更', () => {
    const { state, length } = toOvertime('ot-1');
    expect(state.clock.phase).toBe('OVERTIME');
    expect(state.shift.overtime.enteredAt).toBe(length);
    expect(
      state.scheduler.items.some((e) => e.kind === 'OVERTIME_DEADLINE' && e.time === length + 7200),
    ).toBe(true);
  });

  it('超時期間 FSM／vitals／電話凍結，已開 order 照完成', () => {
    const engine = kitEngine({ ...noEnergy, 'rounds-topics': [] });
    const init = engine.init(kitParams('ot-freeze', 'DAY'));
    const length = engine.config.shifts.day.regularSeconds;
    const atEnd = drive(engine, init, length - 120, { step: 300 }).state;
    const placed = feed(engine, atEnd, [
      intentEvent({
        type: 'EXTENSION',
        module: 'ward',
        name: 'GO_TO_BED',
        payload: { bed: Object.values(atEnd.patients)[0]?.bed ?? 1 },
      }),
    ]);
    const into = drive(engine, placed.state, 130, { step: 10 }).state;
    expect(into.clock.phase).toBe('OVERTIME');
    const snapshot = JSON.stringify(
      Object.values(into.patients).map((p) => [
        p.hidden.fsm,
        p.hidden.lastSampleAt,
        p.visible.vitals,
      ]),
    );
    const callsBefore = into.ward.calls.length;
    const later = drive(engine, into, 3000, { step: 100 }).state;
    expect(later.clock.t).toBeGreaterThan(into.clock.t);
    expect(
      JSON.stringify(
        Object.values(later.patients).map((p) => [
          p.hidden.fsm,
          p.hidden.lastSampleAt,
          p.visible.vitals,
        ]),
      ),
    ).toBe(snapshot);
    expect(later.ward.calls.length).toBe(callsBefore);
    expect(later.scheduler.items.some((e) => e.kind === 'VITALS_SAMPLE')).toBe(false);
  });

  it('超時期間唔可以開新工作（落 order、委派、新致電），但可以交更', () => {
    const { engine, state } = toOvertime('ot-block');
    const sayResult = feed(engine, state, [say('check vitals')]);
    expect(sayResult.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'OVERTIME_FROZEN',
      tone: 'warn',
    });
    expect(Object.keys(sayResult.state.orders)).toEqual(Object.keys(state.orders));
    const handover = feed(engine, state, [shiftAct('BEGIN_HANDOVER')]);
    expect(handover.state.clock.phase).toBe('HANDOVER');
  });

  it('2 小時後強制交更：結局只得「超時」標籤，記 OVERTIME_MINUTES／HANDOVER_FORCED，時鐘停', () => {
    const { engine, state, length } = toOvertime('ot-force');
    const forced = drive(engine, state, 7300, { step: 300 }).state;
    expect(forced.clock.phase).toBe('ENDED');
    expect(forced.shift.ending).toMatchObject({
      reason: 'OVERTIME',
      tags: ['OVERTIME'],
      forced: true,
    });
    expect(forced.clock.t).toBe(length + 7200);
    expect(ledgerOf(forced, 'HANDOVER_FORCED')).toHaveLength(1);
    expect(ledgerOf(forced, 'OVERTIME_MINUTES')).toHaveLength(
      Math.floor(7200 / engine.config.shifts.overtimePenaltyStepSeconds),
    );
    const after = feed(engine, forced, [{ type: 'TICK', dtRealMs: 60_000 }]);
    expect(after.state.clock.t).toBe(forced.clock.t);
  });

  it('玩家主動交更：揀病人、記溝通分（需要提及／遺漏／穩定），標籤為空', () => {
    const engine = kitEngine({ ...noEnergy, 'rounds-topics': [] });
    const init = engine.init(kitParams('ot-handover', 'DAY'));
    let state = drive(engine, init, engine.config.shifts.day.regularSeconds + 1, {
      step: 300,
    }).state;
    expect(state.clock.phase).toBe('OVERTIME');
    state = feed(engine, state, [shiftAct('BEGIN_HANDOVER')]).state;
    const ids = Object.keys(state.patients);
    expect(ids.length).toBeGreaterThan(2);
    const first = ids[0] ?? '';
    state = feed(engine, state, [shiftAct('HANDOVER_TOGGLE', { patientId: first })]).state;
    expect(state.shift.handover.selected).toEqual([first]);
    const done = feed(engine, state, [shiftAct('HANDOVER_CONFIRM')]).state;
    expect(done.clock.phase).toBe('ENDED');
    expect(done.shift.ending).toMatchObject({
      reason: 'NORMAL',
      tags: [],
      forced: false,
      selected: [first],
    });
    const handoverRules = done.ward.ledger.filter((e) => e.rule.startsWith('HANDOVER_'));
    expect(handoverRules.length).toBeGreaterThan(0);
    expect(handoverRules.every((e) => e.subscore === 'COMMUNICATION')).toBe(true);
  });

  it('規定時間內唔可以交更；未交更階段唔可以確認', () => {
    const engine = kitEngine(noEnergy);
    const state = engine.init(kitParams('ot-early', 'DAY'));
    const res = feed(engine, state, [shiftAct('BEGIN_HANDOVER')]);
    expect(res.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'HANDOVER_NOT_AVAILABLE',
      tone: 'warn',
    });
    expect(res.state.clock.phase).toBe('REGULAR');
  });
});

describe('精力同暈倒（T20）', () => {
  it('On call 完全唔自我照顧：34 小時前暈倒，結局只得「暈倒」標籤', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('faint-1', 'ONCALL'));
    const end = drive(engine, init, 36 * H, { step: 600 }).state;
    expect(end.clock.phase).toBe('ENDED');
    expect(end.clock.t).toBeLessThan(34 * H);
    expect(end.shift.ending).toMatchObject({ reason: 'FAINT', tags: ['FAINT'], forced: true });
    expect(end.shift.energy.percent).toBe(0);
    expect(ledgerOf(end, 'FAINT')).toHaveLength(1);
    expect(ledgerOf(end, 'OVERTIME_MINUTES')).toHaveLength(0);
    expect(ledgerOf(end, 'OVERTIME_ENTERED')).toHaveLength(0);
  }, 60_000);

  it('正常食飯加短睡可以撐到尾（On call 34 小時）', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('survive-1', 'ONCALL'));
    const end = drive(engine, init, 34 * H + 10, {
      step: 300,
      act: (state) => {
        if (state.shift.selfCare.active) return [];
        const acts = [];
        if (state.shift.energy.percent < 80)
          acts.push(shiftAct('SELF_CARE_START', { actionId: 'NAP' }));
        acts.push(shiftAct('SELF_CARE_START', { actionId: 'MEAL' }));
        return acts;
      },
    }).state;
    expect(end.shift.ending?.reason).not.toBe('FAINT');
    expect(end.clock.phase).toBe('OVERTIME');
    expect(end.shift.energy.percent).toBeGreaterThan(0);
    expect(end.shift.mealsTaken).toHaveLength(3);
  }, 60_000);

  it('自我照顧：食飯只可喺用餐窗口、每個窗口一次；短睡有冷卻；進行中唔可以做其他事；提早停止按比例回復', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    let state = engine.init(kitParams('care-1', 'DAY', { ward: false }));
    const early = feed(engine, state, [shiftAct('SELF_CARE_START', { actionId: 'MEAL' })]);
    expect(early.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'SELF_CARE_UNAVAILABLE',
      tone: 'warn',
    });

    state = drive(engine, state, 4 * H + 60, { step: 300 }).state;
    const energyBefore = state.shift.energy.percent;
    state = feed(engine, state, [shiftAct('SELF_CARE_START', { actionId: 'MEAL' })]).state;
    expect(state.shift.selfCare.active?.actionId).toBe('MEAL');
    const busy = feed(engine, state, [say('check vitals')]);
    expect(busy.effects).toContainEqual({ type: 'NOTICE', kind: 'SELF_CARE_BUSY', tone: 'warn' });

    const halfway = drive(engine, state, 900, { step: 300 }).state;
    const stopped = feed(engine, halfway, [shiftAct('SELF_CARE_STOP')]).state;
    expect(stopped.shift.selfCare.active).toBeNull();
    expect(stopped.shift.energy.percent).toBeGreaterThan(halfway.shift.energy.percent);
    expect(stopped.shift.energy.percent).toBeLessThan(energyBefore + 15);

    const again = feed(engine, stopped, [shiftAct('SELF_CARE_START', { actionId: 'MEAL' })]);
    expect(again.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'SELF_CARE_UNAVAILABLE',
      tone: 'warn',
    });

    const nap = feed(engine, stopped, [shiftAct('SELF_CARE_START', { actionId: 'NAP' })]).state;
    const napDone = drive(engine, nap, 1300, { step: 100 }).state;
    expect(napDone.shift.selfCare.active).toBeNull();
    expect(ledgerOf(napDone, 'SELF_CARE_NAP')).toHaveLength(1);
    const napAgain = feed(engine, napDone, [shiftAct('SELF_CARE_START', { actionId: 'NAP' })]);
    expect(napAgain.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'SELF_CARE_UNAVAILABLE',
      tone: 'warn',
    });
  });

  it('行路、致電、委派按 T20 扣精力；精力低於門檻時護士提示小休（有冷卻）', () => {
    const engine = kitEngine({ 'rounds-topics': [] });
    const init = engine.init(kitParams('cost-1', 'DAY'));
    const bed = Object.values(init.patients)[0]?.bed ?? 1;
    const moved = feed(engine, init, [
      intentEvent({ type: 'EXTENSION', module: 'ward', name: 'GO_TO_BED', payload: { bed } }),
    ]).state;
    expect(moved.shift.energy.percent).toBeLessThan(init.shift.energy.percent);

    const low = { ...init, shift: { ...init.shift, energy: { percent: 40, lastNudgeAt: null } } };
    const withTick = {
      ...low,
      scheduler: enqueue(low.scheduler, { time: 1, priority: 3, kind: 'ENERGY_TICK' }),
    };
    const run = feed(engine, withTick, [{ type: 'TICK', dtRealMs: 5000 }]);
    expect(run.effects).toContainEqual({ type: 'NOTICE', kind: 'REST_NUDGE', tone: 'info' });
    expect(run.state.shift.energy.lastNudgeAt).toBe(1);
  });
});
