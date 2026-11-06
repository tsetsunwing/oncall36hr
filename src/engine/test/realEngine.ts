/** 用真 content 表跑 engine 嘅測試輔助：驗證表同 engine 嘅接駁，而唔係 mock 表。 */
import { getConfig, getContent } from '@/content';
import type { EngineTables } from '../case/tables';
import { gameSecondsPerRealMs } from '../core/clock';
import type { EngineEvent, Effect, PlayerIntent } from '../core/events';
import { createEngine, type Engine } from '../core/reducer';
import type { GameState, NewGameParams } from '../core/state';

export function realTables(): EngineTables {
  return getContent().tables;
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
  return createEngine(getConfig(), { tables });
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
