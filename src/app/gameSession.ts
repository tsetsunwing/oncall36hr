/**
 * 一局遊戲嘅 session：組裝 engine、runtime、AI gateway、存檔同計時器，並向 UI 提供 ViewModel。
 * 組裝根（app）係唯一同時認識 engine、ai、view 嘅地方；UI 只見到 GameView／GameActions。
 */
import type { AiGateway } from '@/ai';
import type {
  AiFailureReason,
  EngineConfig,
  EngineEvent,
  EngineTables,
  GameState,
  NewGameParams,
} from '@/engine';
import { createEngine, type Engine } from '@/engine';
import { selectGameView, type GameActions, type GameView, type ViewEnv } from '@/view';
import { createGameRuntime, type GameRuntime } from './runtime';
import type { SaveService } from './saveService';

export interface TimerApi {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  now(): number;
}

export interface GameSessionOptions {
  config: EngineConfig & ViewEnv['config'] & { ui: { tickIntervalMs: number } };
  tables: EngineTables;
  params: NewGameParams;
  gateway: AiGateway;
  saves: SaveService;
  timer?: TimerApi;
  initialState?: GameState;
  onSaveError?: (error: unknown) => void;
}

export interface GameSession {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => GameView;
  getState: () => GameState;
  actions: GameActions;
  dispatch: (event: EngineEvent) => void;
  start: () => void;
  stop: () => void;
  /** 等所有 in-flight AI 請求同存檔完成（測試用） */
  settled: () => Promise<void>;
}

const browserTimer: TimerApi = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (id) => {
    window.clearInterval(id);
  },
  now: () => performance.now(),
};

const MAX_TICK_MS = 1000;

export function createGameSession(options: GameSessionOptions): GameSession {
  const timer = options.timer ?? browserTimer;
  const engine: Engine = createEngine(options.config, { tables: options.tables });
  const listeners = new Set<() => void>();
  const inflight = new Set<Promise<void>>();
  let failureReason: AiFailureReason | null = null;
  let stopped = false;
  let timerId: number | null = null;
  let lastTickAt = 0;

  const env = (): ViewEnv => ({
    tables: options.tables,
    config: options.config,
    aiFailureReason: failureReason,
  });

  const runtime: GameRuntime = createGameRuntime({
    engine,
    saves: options.saves,
    initialState: options.initialState ?? engine.init(options.params),
    onEffect(effect) {
      if (effect.type !== 'AI_REQUEST') return;
      const task = options.gateway
        .run({ reqId: effect.reqId, kind: effect.kind, context: effect.context })
        .then((outcome) => {
          if (stopped) return;
          if (outcome.ok) {
            failureReason = null;
            runtime.dispatch({ type: 'AI_RESULT', reqId: effect.reqId, payload: outcome.payload });
          } else {
            failureReason = outcome.reason;
            runtime.dispatch({ type: 'AI_FAILURE', reqId: effect.reqId, reason: outcome.reason });
          }
        })
        .finally(() => {
          inflight.delete(task);
        });
      inflight.add(task);
    },
    onSaveError: (error) => options.onSaveError?.(error),
  });

  let view = selectGameView(runtime.getState(), env());

  function publish(): void {
    view = selectGameView(runtime.getState(), env());
    for (const listener of listeners) listener();
  }

  function dispatch(event: EngineEvent): void {
    runtime.dispatch(event);
    publish();
  }

  function tick(): void {
    const now = timer.now();
    const dt = Math.min(MAX_TICK_MS, Math.max(0, now - lastTickAt));
    lastTickAt = now;
    const before = runtime.getState();
    if (before.paused) return;
    runtime.dispatch({ type: 'TICK', dtRealMs: dt });
    const after = runtime.getState();
    const unchanged =
      after.clock.t === before.clock.t &&
      after.patients === before.patients &&
      after.chats === before.chats &&
      after.orders === before.orders &&
      after.actionLog === before.actionLog &&
      after.pendingAi === before.pendingAi &&
      after.paused === before.paused;
    if (!unchanged) publish();
  }

  const actions: GameActions = {
    submitChat(patientId, text) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'SUBMIT_CHAT', patientId, text } });
    },
    togglePause() {
      const state = runtime.getState();
      if (state.paused?.by === 'ai-failure') return;
      dispatch({ type: 'PLAYER_INTENT', intent: { type: state.paused ? 'RESUME' : 'PAUSE' } });
    },
    setSpeed(speed) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'SET_SPEED', speed } });
    },
    cancelOrder(orderId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'CANCEL_ORDER', orderId } });
    },
    retryAi() {
      const paused = runtime.getState().paused;
      if (paused?.by !== 'ai-failure' || !paused.reqId) return;
      dispatch({ type: 'RESUME_FROM_FAILURE', reqId: paused.reqId });
    },
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => view,
    getState: () => runtime.getState(),
    actions,
    dispatch,
    start() {
      if (timerId !== null) return;
      stopped = false;
      lastTickAt = timer.now();
      timerId = timer.setInterval(tick, options.config.ui.tickIntervalMs);
    },
    stop() {
      stopped = true;
      if (timerId !== null) timer.clearInterval(timerId);
      timerId = null;
    },
    async settled() {
      while (inflight.size > 0) await Promise.all([...inflight]);
      await runtime.flushSaves();
    },
  };
}
