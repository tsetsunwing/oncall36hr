/** 用真 content 表跑 engine 嘅測試輔助：驗證表同 engine 嘅接駁，而唔係 mock 表。 */
import { getConfig, getContent } from '@/content';
import type { EngineTables } from '../case/tables';
import { gameSecondsPerRealMs } from '../core/clock';
import type { EngineEvent, Effect, PlayerIntent } from '../core/events';
import { createEngine, type Engine } from '../core/reducer';
import type { GameState, NewGameParams } from '../core/state';

/** 測試用真 config：關閉「等 AI 自動暫停」，令冇回覆 AI 嘅舊測試照樣前進；C1 行為由專屬測試覆蓋 */
export function realConfig(): ReturnType<typeof getConfig> {
  const base = getConfig();
  return { ...base, clock: { ...base.clock, pauseWhileAiPending: false } };
}

/** 完整 content 表（含巡房題目） */
export function fullTables(): EngineTables {
  return getContent().tables;
}

/** 舊測試用：巡房冇題目，巡房即時結束，唔使答 AI（巡房行為由 shift 測試覆蓋） */
export function realTables(): EngineTables {
  return { ...getContent().tables, 'rounds-topics': [] };
}

export function zeroNoiseTables(): EngineTables {
  const tables = realTables();
  return {
    ...tables,
    trajectories: tables.trajectories.map((t) => ({
      ...t,
      noise: { hr: 0, sbp: 0, dbp: 0, spo2: 0, rr: 0, temp: 0 },
    })),
  };
}

export function realEngine(tables: EngineTables = realTables()): Engine {
  return createEngine(realConfig(), { tables });
}

export const params = (seed = 'real-A'): NewGameParams => ({
  seed,
  mode: 'NIGHT',
  difficulty: 'MEDIUM',
  playerRank: 'MO',
});

export interface Run {
  state: GameState;
  effects: Effect[];
}

export function feed(engine: Engine, state: GameState, events: EngineEvent[]): Run {
  let current = state;
  const effects: Effect[] = [];
  for (const event of events) {
    const result = engine.reduce(current, event);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}

/** 前進 N 遊戲秒（1x、無暫停）：換算成真實毫秒再 TICK */
export function advance(engine: Engine, state: GameState, gameSeconds: number): Run {
  const rate = gameSecondsPerRealMs(engine.config, state);
  return feed(engine, state, [{ type: 'TICK', dtRealMs: gameSeconds / rate }]);
}

export const intentEvent = (intent: PlayerIntent): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent,
});

export const say = (text: string): EngineEvent =>
  intentEvent({ type: 'SUBMIT_CHAT', patientId: 'p1', text });

export function aiRequests(effects: readonly Effect[]) {
  return effects.flatMap((e) => (e.type === 'AI_REQUEST' ? [e] : []));
}

export interface GateAnswer {
  verdict?: 'OK' | 'CONFIRM' | 'OBJECT';
  concerns?: { category: string; line: string }[];
}

const GATE_KINDS = ['gate.pharmacy', 'gate.nurse'];

/** 回覆所有未決嘅藥房／護士審視（預設全部 OK），直到再冇新嘅審視請求 */
export function answerGates(
  engine: Engine,
  run: Run,
  answers: Partial<Record<'gate.pharmacy' | 'gate.nurse', GateAnswer>> = {},
): Run {
  let current = run;
  const effects: Effect[] = [...run.effects];
  let pending = aiRequests(run.effects).filter((r) => GATE_KINDS.includes(r.kind));
  while (pending.length > 0) {
    const events: EngineEvent[] = pending.map((request) => {
      const answer = answers[request.kind as 'gate.pharmacy' | 'gate.nurse'] ?? {};
      return {
        type: 'AI_RESULT',
        reqId: request.reqId,
        payload: { verdict: answer.verdict ?? 'OK', concerns: answer.concerns ?? [] },
      };
    });
    const next = feed(engine, current.state, events);
    effects.push(...next.effects);
    current = next;
    pending = aiRequests(next.effects).filter((r) => GATE_KINDS.includes(r.kind));
  }
  return { state: current.state, effects };
}
