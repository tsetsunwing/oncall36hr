/**
 * 純 reducer：`reduce(state, event) → { state', effects[] }`（implementation-plan §2.3）。
 * 冇任何 I/O、冇 Date／Math.random；時間來自 TICK，隨機來自 state.rng。
 */
import { gameSecondsPerRealMs } from './clock';
import type { EngineConfig } from './config';
import { enqueue, peek, pop, type ScheduledEvent } from './eventQueue';
import type { Effect, EngineEvent, PlayerIntent, Reduction } from './events';
import { EMPTY_TABLES, type EngineTables } from '../case/tables';
import type { EngineContext, EngineModule } from './module';
import {
  AUTOSAVE_EVENT_KIND,
  AUTOSAVE_PRIORITY,
  createInitialState,
  type GameState,
  type NewGameParams,
} from './state';
import { bedsideModule } from '../bedside/bedside';
import { caseModule } from '../case/caseModule';
import { gateModule } from '../gate/gate';
import { ordersModule } from '../orders/orders';
import { resultsModule } from '../results/results';
import { requestAi } from './ai';

export const defaultModules: readonly EngineModule[] = [
  ordersModule,
  gateModule,
  resultsModule,
  caseModule,
  bedsideModule,
];

export { requestAi };

/** 單一 TICK 內最多處理嘅排程事件數，防止事件自我重排造成死循環 */
const MAX_EVENTS_PER_TICK = 100_000;

export interface Engine {
  readonly config: EngineConfig;
  readonly tables: EngineTables;
  init(params: NewGameParams): GameState;
  reduce(state: GameState, event: EngineEvent): Reduction;
}

export interface EngineOptions {
  modules?: readonly EngineModule[];
  /** 內容表（T1–T30 嘅 engine 子集）；唔提供就係空表，case／order 模組冇嘢可做 */
  tables?: EngineTables;
}

const none = (state: GameState): Reduction => ({ state, effects: [] });

function notice(
  state: GameState,
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
  tone: 'info' | 'warn' | 'error' = 'warn',
): Reduction {
  return { state, effects: [{ type: 'NOTICE', kind, tone }] };
}

function pause(state: GameState, by: 'player' | 'ai-failure' | 'forced', reqId: string | null) {
  return { ...state, paused: { by, reqId } };
}

/** 載入存檔後預設暫停，由玩家手動繼續（§12.1）；AI 失敗暫停則保留 */
export function prepareLoadedState(state: GameState): GameState {
  return state.paused ? state : pause(state, 'player', null);
}

function dedupeSaves(effects: Effect[]): Effect[] {
  const seen = new Set<string>();
  return effects.filter((effect) => {
    if (effect.type !== 'SAVE') return true;
    const key = JSON.stringify([effect.target, effect.reason]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createEngine(config: EngineConfig, options: EngineOptions = {}): Engine {
  const modules = options.modules ?? defaultModules;
  const tables = options.tables ?? EMPTY_TABLES;
  const ctx: EngineContext = { config, tables };

  function applyIntentToModules(state: GameState, intent: PlayerIntent): Reduction | undefined {
    for (const module of modules) {
      const result = module.handleIntent?.(state, intent, ctx);
      if (result) return result;
    }
    return undefined;
  }

  function handleCoreIntent(state: GameState, intent: PlayerIntent): Reduction | undefined {
    switch (intent.type) {
      case 'PAUSE': {
        if (state.paused) return none(state);
        return {
          state: pause(state, 'player', null),
          effects: [{ type: 'SAVE', target: { kind: 'AUTO' }, reason: 'PAUSE' }],
        };
      }
      case 'RESUME': {
        if (!state.paused) return none(state);
        if (state.paused.by !== 'player') return notice(state, 'RESUME_BLOCKED_AI_FAILURE');
        return none({ ...state, paused: null });
      }
      case 'SET_SPEED': {
        if (!config.clock.speeds.includes(intent.speed)) return notice(state, 'SPEED_INVALID');
        if (intent.speed === 0) return handleCoreIntent(state, { type: 'PAUSE' });
        const next = { ...state, clock: { ...state.clock, speed: intent.speed } };
        return none(state.paused?.by === 'player' ? { ...next, paused: null } : next);
      }
      case 'SAVE_GAME': {
        if (
          !Number.isInteger(intent.slot) ||
          intent.slot < 1 ||
          intent.slot > config.saves.manualSlots
        ) {
          return notice(state, 'SAVE_SLOT_INVALID');
        }
        return {
          state,
          effects: [
            { type: 'SAVE', target: { kind: 'MANUAL', slot: intent.slot }, reason: 'MANUAL' },
          ],
        };
      }
      default:
        return undefined;
    }
  }

  function handleScheduled(state: GameState, event: ScheduledEvent): Reduction {
    if (event.kind === AUTOSAVE_EVENT_KIND) {
      const intervalSec = Math.round(config.saves.autoSaveEveryGameMinutes * 60);
      return {
        state: {
          ...state,
          scheduler: enqueue(state.scheduler, {
            time: event.time + intervalSec,
            priority: AUTOSAVE_PRIORITY,
            kind: AUTOSAVE_EVENT_KIND,
          }),
        },
        effects: [{ type: 'SAVE', target: { kind: 'AUTO' }, reason: 'INTERVAL' }],
      };
    }
    for (const module of modules) {
      const result = module.handleScheduled?.(state, event, ctx);
      if (result) return result;
    }
    return none(state);
  }

  function tick(initial: GameState, dtRealMs: number): Reduction {
    if (!Number.isFinite(dtRealMs) || dtRealMs <= 0) return none(initial);
    let state = initial;
    const effects: Effect[] = [];
    let remainingMs = dtRealMs;

    for (let handled = 0; ; handled++) {
      const rate = gameSecondsPerRealMs(config, state);
      if (rate <= 0) break;
      const now = state.clock.t + state.clock.frac;
      const next = peek(state.scheduler);

      if (next && next.time <= now + remainingMs * rate) {
        if (handled >= MAX_EVENTS_PER_TICK) {
          throw new Error('engine：單一 TICK 內處理過多排程事件（疑似事件自我重排死循環）');
        }
        const consumedMs = Math.max(0, (next.time - now) / rate);
        remainingMs = Math.max(0, remainingMs - consumedMs);
        const popped = pop(state.scheduler);
        if (!popped) break;
        const advanced: GameState = {
          ...state,
          clock: next.time > now ? { ...state.clock, t: next.time, frac: 0 } : state.clock,
          scheduler: popped.queue,
        };
        const result = handleScheduled(advanced, next);
        state = result.state;
        effects.push(...result.effects);
        continue;
      }

      const total = now + remainingMs * rate;
      const t = Math.floor(total);
      state = { ...state, clock: { ...state.clock, t, frac: total - t } };
      break;
    }
    return { state, effects };
  }

  function reduce(state: GameState, event: EngineEvent): Reduction {
    let result: Reduction;
    switch (event.type) {
      case 'TICK':
        result = tick(state, event.dtRealMs);
        break;

      case 'PLAYER_INTENT':
        result =
          handleCoreIntent(state, event.intent) ??
          applyIntentToModules(state, event.intent) ??
          none(state);
        break;

      case 'AI_RESULT': {
        const pending = state.pendingAi.find((p) => p.reqId === event.reqId);
        const pendingAi = state.pendingAi.filter((p) => p.reqId !== event.reqId);
        const cleared = { ...state, pendingAi };
        result = none(cleared);
        for (const module of modules) {
          const moduleResult = module.handleAiResult?.(
            cleared,
            event.reqId,
            event.payload,
            ctx,
            pending,
          );
          if (moduleResult) {
            result = moduleResult;
            break;
          }
        }
        break;
      }

      case 'AI_FAILURE':
        result = {
          state: pause(state, 'ai-failure', event.reqId),
          effects: [{ type: 'SAVE', target: { kind: 'AI_FAILURE' }, reason: 'AI_FAILURE' }],
        };
        break;

      case 'RESUME_FROM_FAILURE': {
        if (state.paused?.by !== 'ai-failure' || state.paused.reqId !== event.reqId) {
          result = notice(state, 'RESUME_NOT_PAUSED_BY_FAILURE');
          break;
        }
        const resumed = { ...state, paused: null };
        const pending = state.pendingAi.find((p) => p.reqId === event.reqId);
        result = {
          state: resumed,
          effects: pending
            ? [
                {
                  type: 'AI_REQUEST',
                  reqId: pending.reqId,
                  kind: pending.kind,
                  context: pending.context,
                },
              ]
            : [],
        };
        break;
      }
    }
    return { state: result.state, effects: dedupeSaves(result.effects) };
  }

  return {
    config,
    tables,
    init: (params) =>
      modules.reduce(
        (state, module) => module.init?.(state, params, ctx) ?? state,
        createInitialState(params, config),
      ),
    reduce,
  };
}

export function replay(
  engine: Engine,
  initial: GameState,
  events: readonly EngineEvent[],
): Reduction {
  let state = initial;
  const effects: Effect[] = [];
  for (const event of events) {
    const result = engine.reduce(state, event);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}
