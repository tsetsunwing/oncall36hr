import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import {
  createEngine,
  shiftIntent,
  type Effect,
  type EngineEvent,
  type GameState,
  type NewGameParams,
} from '@/engine';
import { selectGameView, type ViewEnv } from './gameView';

const baseConfig = getConfig();
const config = { ...baseConfig, clock: { ...baseConfig.clock, pauseWhileAiPending: false } };
const tables = getContent().tables;
const engine = createEngine(config, { tables });
const env: ViewEnv = { tables, config };

const params = (mode: NewGameParams['mode']): NewGameParams => ({
  seed: 'shift-view',
  mode,
  difficulty: 'MEDIUM',
  playerRank: 'MO',
  ward: true,
});

const tick = (gameSeconds: number): EngineEvent => ({
  type: 'TICK',
  dtRealMs: (gameSeconds / 60) * config.clock.realSecondsPerGameMinuteAt1x * 1000,
});
const intent = (name: string, payload: Record<string, unknown> = {}): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: shiftIntent(name, payload),
});

function aiRequests(effects: readonly Effect[]) {
  return effects.flatMap((e) => (e.type === 'AI_REQUEST' ? [e] : []));
}

/** 推進到指定時間，期間丟棄所有 AI 請求（對話等），只保留巡房請求 */
function advanceTo(state: GameState, target: number, requests: ReturnType<typeof aiRequests> = []) {
  let current = state;
  while (current.clock.t < target && current.clock.phase !== 'ENDED') {
    const step = engine.reduce(
      { ...current, pendingAi: current.pendingAi.filter((p) => p.kind.startsWith('rounds.')) },
      tick(30),
    );
    current = step.state;
    requests.push(...aiRequests(step.effects).filter((r) => r.kind.startsWith('rounds.')));
  }
  return current;
}

describe('更次 ViewModel', () => {
  it('開局：模式、精力、巡房次數、自我照顧清單都由 engine 狀態映射', () => {
    const state = engine.init(params('DAY'));
    const { shift } = selectGameView(state, env);
    expect(shift.shiftMode).toBe('DAY');
    expect(shift.phase).toBe('REGULAR');
    expect(shift.segment).toBe('DAY');
    expect(shift.energy).toEqual({ percent: 100, level: 'NORMAL' });
    expect(shift.rounds.total).toBe(2);
    expect(shift.rounds.nextAtLabel).toBe('09:00');
    expect(shift.selfCare.actions.map((a) => a.id)).toEqual([
      'MEAL',
      'NAP',
      'TOILET',
      'WATER',
      'PHONE_CHAT',
      'MUSIC',
    ]);
    expect(shift.selfCare.actions.find((a) => a.id === 'MEAL')?.available).toBe(false);
    expect(shift.selfCare.actions.find((a) => a.id === 'NAP')?.available).toBe(true);
    expect(shift.result).toBeNull();
    expect(selectGameView(engine.init(params('ONCALL')), env).shift.rounds.total).toBe(4);
    expect(selectGameView(engine.init(params('NIGHT')), env).shift.rounds.total).toBe(0);
  });

  it('等 AI 回覆時 waitingForAi 為 true（C1）', () => {
    const state = engine.init(params('DAY'));
    const pending = {
      ...state,
      pendingAi: [{ reqId: 'r1', kind: 'dialogue.turn', context: null }],
    };
    expect(selectGameView(pending, env).shift.waitingForAi).toBe(false);
    const pausing: ViewEnv = {
      tables,
      config: { ...config, clock: { ...config.clock, pauseWhileAiPending: true } },
    };
    expect(selectGameView(pending, pausing).shift.waitingForAi).toBe(true);
  });

  it('巡房：載入、發問、揭曉三個階段；key facts 只喺揭曉時出現', () => {
    const requests: ReturnType<typeof aiRequests> = [];
    let state = advanceTo(engine.init(params('DAY')), 3600 + 60, requests);
    expect(selectGameView(state, env).shift.rounds.offered).toBe(true);
    expect(selectGameView(state, env).shift.rounds.active).toBeNull();
    const begun = engine.reduce(state, intent('ROUND_BEGIN'));
    requests.push(...aiRequests(begun.effects));
    state = begun.state;
    let round = selectGameView(state, env).shift.rounds.active;
    expect(round?.phase).toBe('LOADING');
    expect(round?.keyFacts).toBeNull();
    expect(round?.question).toBeNull();
    const questionReq = requests.find((r) => r.kind === 'rounds.question');
    expect(questionReq).toBeDefined();

    state = engine.reduce(state, {
      type: 'AI_RESULT',
      reqId: questionReq?.reqId ?? '',
      payload: { question: '你會點處理呢位病人？', hints: ['提示甲', '提示乙', '提示丙'] },
    }).state;
    round = selectGameView(state, env).shift.rounds.active;
    expect(round?.phase).toBe('ASKING');
    expect(round?.question).toBe('你會點處理呢位病人？');
    expect(round?.hints).toHaveLength(3);
    expect(round?.canAnswer).toBe(true);
    expect(round?.keyFacts).toBeNull();
    expect(round?.secondsLeft).toBeGreaterThan(0);

    const answered = engine.reduce(
      state,
      intent('ROUND_ANSWER', { text: '我會先評估', viaHint: false }),
    );
    state = answered.state;
    const gradeReq = aiRequests(answered.effects).find((r) => r.kind === 'rounds.grade');
    const prompt = (gradeReq?.context as { prompt: { keyFacts: { id: string }[] } }).prompt;
    const firstId = prompt.keyFacts[0]?.id ?? '';
    state = engine.reduce(state, {
      type: 'AI_RESULT',
      reqId: gradeReq?.reqId ?? '',
      payload: { verdict: 'CORRECT', matchedKeyFacts: [firstId], seniorLine: '啱' },
    }).state;
    round = selectGameView(state, env).shift.rounds.active;
    expect(round?.phase).toBe('REVEAL');
    expect(round?.verdict).toBe('CORRECT');
    expect(round?.keyFacts?.find((f) => f.id === firstId)?.matched).toBe(true);
    expect(round?.canNext).toBe(true);
  });

  it('超時：橫額倒數；交更名單唔會標示邊個病人需要提及', () => {
    let state = advanceTo(engine.init(params('DAY')), 36000 + 120);
    const view = selectGameView(state, env);
    expect(view.shift.phase).toBe('OVERTIME');
    expect(view.shift.overtime?.remainingSec).toBeGreaterThan(0);
    expect(view.shift.overtime?.deadlineLabel).toBe('20:00');

    state = engine.reduce(state, intent('BEGIN_HANDOVER')).state;
    const handover = selectGameView(state, env).shift.handover;
    expect(handover?.candidates.length).toBeGreaterThan(0);
    expect(JSON.stringify(handover).toLowerCase()).not.toContain('needed');
    const first = handover?.candidates[0];
    state = engine.reduce(state, intent('HANDOVER_TOGGLE', { patientId: first?.patientId })).state;
    expect(selectGameView(state, env).shift.handover?.candidates[0]?.selected).toBe(true);

    state = engine.reduce(state, intent('HANDOVER_CONFIRM')).state;
    const { shift } = selectGameView(state, env);
    expect(shift.result?.reason).toBe('NORMAL');
    expect(shift.result?.tags).toEqual([]);
    expect(shift.result?.subscores.map((s) => s.id)).toEqual([
      'CLINICAL_OUTCOME',
      'TIMELINESS',
      'SAFETY',
      'COMMUNICATION',
      'PRIORITISATION',
      'SELF_CARE',
    ]);
    const json = JSON.stringify(shift.result);
    expect(json).not.toContain('"totalScore"');
    expect(json).not.toMatch(/"(totalScore|multiplier|sum)"/u);
    for (const sub of shift.result?.subscores ?? []) {
      expect(['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_IMPROVEMENT']).toContain(sub.grade);
    }
    const review = shift.result?.review;
    expect(review?.table.map((t) => t.id)).toEqual(shift.result?.subscores.map((s) => s.id));
    expect(review?.timeline.length).toBeGreaterThan(0);
    expect(review?.timeline.every((item) => /^\d{2}:\d{2}$/u.test(item.timeLabel))).toBe(true);
  });

  it('暈倒：結局只得 FAINT 標籤，冇超時分項', () => {
    let state = engine.init(params('ONCALL'));
    state = {
      ...state,
      shift: { ...state.shift, energy: { ...state.shift.energy, percent: 0.05 } },
    };
    state = advanceTo(state, 600);
    const { shift } = selectGameView(state, env);
    expect(shift.result?.reason).toBe('FAINT');
    expect(shift.result?.tags).toEqual(['FAINT']);
    const rules = shift.result?.subscores.flatMap((s) => s.items.map((i) => i.rule)) ?? [];
    expect(rules).toContain('FAINT');
    expect(rules).not.toContain('OVERTIME_ENTERED');
    expect(rules).not.toContain('OVERTIME_MINUTES');
  });
});
