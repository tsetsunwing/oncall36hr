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
  JsonValue,
  NewGameParams,
} from '@/engine';
import {
  COMPLETE_STEP_INTENT,
  createEngine,
  DEATH_MODULE,
  shiftIntent,
  type Engine,
} from '@/engine';
import { selectGameView, type GameActions, type GameView, type ViewEnv } from '@/view';
import { trackSaves } from './saveFlush';
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
  /** 等已排隊的存檔寫完 */
  flush: () => Promise<void>;
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
  let failureDetail: string | null = null;
  let notice: GameView['notice'] = null;
  let stopped = false;
  let timerId: number | null = null;
  let lastTickAt = 0;
  let resent = false;
  let unbindHide = (): void => undefined;

  function sendAiRequest(request: { reqId: string; kind: string; context: JsonValue }): void {
    const task = options.gateway
      .run({ reqId: request.reqId, kind: request.kind, context: request.context })
      .then((outcome) => {
        if (stopped) return;
        if (outcome.ok) {
          failureReason = null;
          failureDetail = null;
          dispatch({ type: 'AI_RESULT', reqId: request.reqId, payload: outcome.payload });
        } else {
          failureReason = outcome.reason;
          failureDetail = outcome.detail;
          dispatch({ type: 'AI_FAILURE', reqId: request.reqId, reason: outcome.reason });
        }
      })
      .finally(() => {
        inflight.delete(task);
      });
    inflight.add(task);
  }

  const env = (): ViewEnv => ({
    tables: options.tables,
    config: options.config,
    aiFailureReason: failureReason,
    aiFailureDetail: failureDetail,
    notice,
  });

  const runtime: GameRuntime = createGameRuntime({
    engine,
    saves: options.saves,
    initialState: options.initialState ?? engine.init(options.params),
    onEffect(effect) {
      if (effect.type === 'NOTICE') {
        notice = { kind: effect.kind, tone: effect.tone };
        return;
      }
      if (effect.type !== 'AI_REQUEST') return;
      sendAiRequest(effect);
    },
    onSaveError: (error) => options.onSaveError?.(error),
  });

  let view = selectGameView(runtime.getState(), env());

  function publish(): void {
    view = selectGameView(runtime.getState(), env());
    for (const listener of listeners) listener();
  }

  function dispatch(event: EngineEvent): void {
    if (event.type === 'PLAYER_INTENT') notice = null;
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
      after.ward === before.ward &&
      after.pendingAi === before.pendingAi &&
      after.paused === before.paused &&
      after.resus === before.resus &&
      after.death === before.death &&
      after.shift === before.shift &&
      after.clock.cprSlow === before.clock.cprSlow;
    if (!unchanged) publish();
  }

  function wardIntent(name: string, payload: Record<string, unknown>): void {
    dispatch({
      type: 'PLAYER_INTENT',
      intent: { type: 'EXTENSION', module: 'ward', name, payload: payload as JsonValue },
    });
  }

  const actions: GameActions = {
    submitChat(patientId, text) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'SUBMIT_CHAT', patientId, text } });
    },
    placeOrder(patientId, catalogId, text, params) {
      dispatch({
        type: 'PLAYER_INTENT',
        intent: { type: 'PLACE_CATALOG', patientId, catalogId, text, params },
      });
    },
    placeTests(patientId, catalogIds, text) {
      dispatch({
        type: 'PLAYER_INTENT',
        intent: { type: 'PLACE_CATALOG_BATCH', patientId, catalogIds, text },
      });
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
    insistOrder(orderId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'INSIST_ORDER', orderId } });
    },
    completeDeathStep(step) {
      dispatch({
        type: 'PLAYER_INTENT',
        intent: {
          type: 'EXTENSION',
          module: DEATH_MODULE,
          name: COMPLETE_STEP_INTENT,
          payload: { step },
        },
      });
    },
    retryAi() {
      const paused = runtime.getState().paused;
      if (paused?.by !== 'ai-failure' || !paused.reqId) return;
      dispatch({ type: 'RESUME_FROM_FAILURE', reqId: paused.reqId });
    },
    goToBed(bed) {
      wardIntent('GO_TO_BED', { bed: bed ?? 0 });
    },
    enterPlace(place) {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('ENTER_PLACE', { place }) });
    },
    transferOut(patientId) {
      wardIntent('TRANSFER_OUT', { patientId });
    },
    discharge(patientId) {
      wardIntent('DISCHARGE', { patientId });
    },
    respondCall(callId, response) {
      wardIntent('RESPOND_CALL', { callId, response });
    },
    prepareCall(patientId, target) {
      wardIntent('PREPARE_CALL', { patientId, target });
    },
    sendCall(sbar) {
      wardIntent('SEND_CALL', { sbar });
    },
    discardCall() {
      wardIntent('DISCARD_CALL', {});
    },
    sendFollowup(callId, text) {
      wardIntent('SEND_FOLLOWUP', { callId, text });
    },
    endCall(callId) {
      wardIntent('END_CALL', { callId });
    },
    familyOption(callId, optionId) {
      wardIntent('FAMILY_OPTION', { callId, optionId });
    },
    familySay(callId, text) {
      wardIntent('FAMILY_SAY', { callId, text });
    },
    startDeathCall(step) {
      wardIntent('START_DEATH_CALL', { step });
    },
    delegate(request) {
      wardIntent('DELEGATE', request);
    },
    beginRound() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('ROUND_BEGIN') });
    },
    answerRound(text, viaHint) {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('ROUND_ANSWER', { text, viaHint }) });
    },
    passRound() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('ROUND_PASS') });
    },
    nextRound() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('ROUND_NEXT') });
    },
    startSelfCare(actionId) {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('SELF_CARE_START', { actionId }) });
    },
    stopSelfCare() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('SELF_CARE_STOP') });
    },
    beginHandover() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('BEGIN_HANDOVER') });
    },
    toggleHandover(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('HANDOVER_TOGGLE', { patientId }) });
    },
    confirmHandover() {
      dispatch({ type: 'PLAYER_INTENT', intent: shiftIntent('HANDOVER_CONFIRM') });
    },
    saveManual(slot) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'SAVE_GAME', slot } });
    },
    measureNibp(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'MEASURE_NIBP', patientId } });
    },
    assessGcs(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'ASSESS_GCS', patientId } });
    },
    assessPain(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'ASSESS_PAIN', patientId } });
    },
    assessAgitation(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'ASSESS_AGITATION', patientId } });
    },
    assessNausea(patientId) {
      dispatch({ type: 'PLAYER_INTENT', intent: { type: 'ASSESS_NAUSEA', patientId } });
    },
  };

  function saveBecauseHidden(): void {
    const pending = options.saves.save(runtime.getState(), { kind: 'AUTO' }).then(
      () => undefined,
      () => undefined,
    );
    trackSaves(pending);
  }

  function bindHideSave(): () => void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
    let guard = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') onPageHide();
    };
    const onPageHide = () => {
      if (guard) return;
      guard = true;
      queueMicrotask(() => {
        guard = false;
      });
      saveBecauseHidden();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }

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
      if (!resent) {
        resent = true;
        if (options.initialState && options.initialState.paused?.by !== 'ai-failure') {
          for (const pending of options.initialState.pendingAi) sendAiRequest(pending);
        }
      }
      timerId = timer.setInterval(tick, options.config.ui.tickIntervalMs);
      unbindHide = bindHideSave();
    },
    stop() {
      stopped = true;
      unbindHide();
      unbindHide = () => undefined;
      if (timerId !== null) timer.clearInterval(timerId);
      timerId = null;
    },
    async settled() {
      while (inflight.size > 0) await Promise.all([...inflight]);
      await runtime.flushSaves();
    },
    flush: () => runtime.flushSaves(),
  };
}
