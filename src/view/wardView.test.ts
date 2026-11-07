import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import {
  createEngine,
  type Effect,
  type EngineEvent,
  type GameState,
  type NewGameParams,
} from '@/engine';
import { selectGameView, type ViewEnv } from './gameView';

const config = getConfig();
const tables = getContent().tables;
const engine = createEngine(config, { tables });
const env: ViewEnv = { tables, config };

const wardParams = (
  seed: string,
  playerRank: NewGameParams['playerRank'],
  difficulty: NewGameParams['difficulty'] = 'MEDIUM',
): NewGameParams => ({ seed, mode: 'NIGHT', difficulty, playerRank, ward: true });

const ward = (name: string, payload: Record<string, unknown>): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: { type: 'EXTENSION', module: 'ward', name, payload: payload as never },
});

function run(state: GameState, events: EngineEvent[]): { state: GameState; effects: Effect[] } {
  let current = state;
  const effects: Effect[] = [];
  for (const event of events) {
    const result = engine.reduce(current, event);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}

const tick = (gameSeconds: number): EngineEvent => ({
  type: 'TICK',
  dtRealMs: (gameSeconds / 30) * 1000,
});

const FORBIDDEN_KEYS = [
  'reliability',
  'speedMultiplier',
  'busyUntil',
  'completesAt',
  'mode',
  'failureModes',
];

describe('ward ViewModel', () => {
  it('20 床平面圖，佔床數同病人數一致', () => {
    const state = engine.init(wardParams('v-1', 'MO'));
    const view = selectGameView(state, env);
    expect(view.ward?.beds).toHaveLength(20);
    expect(view.ward?.beds.filter((b) => b.patientId !== null)).toHaveLength(
      Object.keys(state.patients).length,
    );
    expect(view.ward?.occupied).toBe(Object.keys(state.patients).length);
    expect(view.patient).toBeNull();
  });

  it('入咗床先有監察儀同對話；離開就冇', () => {
    let state = engine.init(wardParams('v-2', 'MO'));
    const patient = Object.values(state.patients)[0];
    if (!patient) throw new Error('no patient');
    state = run(state, [ward('GO_TO_BED', { bed: patient.bed })]).state;
    const at = selectGameView(state, env);
    expect(at.patient?.id).toBe(patient.id);
    expect(at.monitor).not.toBeNull();
    expect(at.chat).not.toBeNull();
    state = run(state, [ward('GO_TO_BED', { bed: 0 })]).state;
    expect(selectGameView(state, env).patient).toBeNull();
  });

  it('舊式單一病人 ward 為 null', () => {
    const state = engine.init({
      seed: 'old',
      mode: 'NIGHT',
      difficulty: 'MEDIUM',
      playerRank: 'MO',
    });
    expect(selectGameView(state, env).ward).toBeNull();
  });

  it('HO：冇下屬；MO／RES：恰好一位，名稱可見但資歷不可見', () => {
    const ho = selectGameView(engine.init(wardParams('v-ho', 'HO')), env).ward;
    expect(ho?.delegation.hasSubordinate).toBe(false);
    expect(ho?.delegation.subordinate).toBeNull();
    for (const rank of ['MO', 'RES'] as const) {
      const state = engine.init(wardParams(`v-${rank}`, rank));
      const view = selectGameView(state, env).ward;
      expect(view?.delegation.hasSubordinate).toBe(true);
      expect(view?.delegation.subordinate?.name).toBe(state.ward.sub?.name);
    }
  });

  it('B7：下屬資歷／可靠度／速度唔會出現喺 view（多 seed、做完委派之後）', () => {
    for (let i = 0; i < 24; i++) {
      for (const rank of ['MO', 'RES'] as const) {
        let state = engine.init(wardParams(`b7-${rank}-${String(i)}`, rank, 'HARD'));
        const sub = state.ward.sub;
        if (!sub) throw new Error('no sub');
        const patient = Object.values(state.patients)[0];
        state = run(state, [
          ward('DELEGATE', {
            task: 'ORDER_NOTE',
            itemId: 'ecg.12lead',
            patientId: patient?.id,
            callId: null,
          }),
          tick(200),
        ]).state;
        state = run(state, [tick(3000)]).state;
        const json = JSON.stringify(selectGameView(state, env));
        expect(json).not.toContain(sub.id);
        expect(json).not.toContain('NOVICE');
        expect(json).not.toContain('SENIOR');
        for (const key of FORBIDDEN_KEYS) expect(json, key).not.toContain(`"${key}"`);
      }
    }
  });

  it('B7：下屬做緊嘅 order，view 唔顯示預計完成時間', () => {
    let state = engine.init(wardParams('b7-eta', 'MO'));
    const patient = Object.values(state.patients)[0];
    state = run(state, [
      ward('GO_TO_BED', { bed: patient?.bed }),
      ward('DELEGATE', {
        task: 'PROCEDURE',
        itemId: 'lab.cbc',
        patientId: patient?.id,
        callId: null,
      }),
    ]).state;
    const view = selectGameView(state, env);
    const row = view.orders.find((o) => o.executorKind === 'SUBORDINATE');
    expect(row).toBeDefined();
    expect(row?.status).toBe('RUNNING');
    expect(row?.etaSeconds).toBeNull();
    expect(view.ward?.delegation.tasks[0]).toMatchObject({
      status: 'RUNNING',
      doneLabel: null,
      elapsedSec: null,
    });
  });

  it('B7：所有發往 AI 嘅 context 都唔含下屬資歷（床邊對話、解析、委派之後）', () => {
    for (let i = 0; i < 12; i++) {
      let state = engine.init(wardParams(`ai-${String(i)}`, 'MO'));
      const sub = state.ward.sub;
      const patient = Object.values(state.patients)[0];
      if (!sub || !patient) throw new Error('setup');
      const result = run(state, [
        ward('GO_TO_BED', { bed: patient.bed }),
        {
          type: 'PLAYER_INTENT',
          intent: { type: 'SUBMIT_CHAT', patientId: patient.id, text: 'oxygen nrb' },
        },
        {
          type: 'PLAYER_INTENT',
          intent: {
            type: 'SUBMIT_CHAT',
            patientId: patient.id,
            text: '請護士同我睇下血壓，仲有叫下屬抽血',
          },
        },
        ward('DELEGATE', {
          task: 'PROCEDURE',
          itemId: 'lab.cbc',
          patientId: patient.id,
          callId: null,
        }),
        tick(4000),
      ]);
      state = result.state;
      const requests = result.effects.filter((e) => e.type === 'AI_REQUEST');
      expect(requests.length).toBeGreaterThan(0);
      const json = JSON.stringify([...requests, ...state.pendingAi]);
      expect(json).not.toContain(sub.id);
      expect(json).not.toContain('NOVICE');
      expect(json).not.toContain('SENIOR');
      const tone = tables.subordinates.find((r) => r.id === sub.id)?.tone ?? '';
      expect(json).not.toContain(tone);
      expect(json).not.toContain('reliability');
    }
  });

  it('電話列表：來電有標籤、病人床號；上報梯只可向上；越級預覽', () => {
    let state = engine.init(wardParams('phone-1', 'MO'));
    state = run(state, [tick(36000)]).state;
    const view = selectGameView(state, env).ward;
    expect(view?.phone.calls.length).toBeGreaterThan(0);
    for (const call of view?.phone.calls ?? []) expect(call.tag.length).toBeGreaterThan(0);
    const patient = Object.values(state.patients)[0];
    const ladder = view?.phone.ladders[patient?.id ?? ''];
    expect(ladder?.map((s) => [s.rank, s.reachable, s.skips])).toEqual([
      ['MO', false, []],
      ['RES', true, []],
      ['AC', true, ['RES']],
      ['COS', true, ['RES', 'AC']],
    ]);
    state = run(state, [
      ward('PREPARE_CALL', { patientId: patient?.id, target: { kind: 'RANK', rank: 'AC' } }),
    ]).state;
    const draft = selectGameView(state, env).ward?.phone.draft;
    expect(draft?.skips).toEqual(['RES']);
    expect(draft?.sbar.S.length).toBeGreaterThan(0);
  });
});
