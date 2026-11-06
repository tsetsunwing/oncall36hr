/** AI 請求／失敗嘅共用 helper：reducer 同各 module 都用，所以獨立成檔避免循環 import。 */
import type { JsonValue } from './eventQueue';
import type { Effect, Reduction } from './events';
import type { GameState, PendingAiRequest } from './state';

/** 令 module 可以發 AI 請求：分配 reqId、記入 pendingAi（存檔會帶住，重試用同一 reqId） */
export function requestAi(
  state: GameState,
  kind: string,
  context: JsonValue,
): { state: GameState; effect: Effect } {
  const reqId = `r${String(state.counters.req + 1)}`;
  return {
    state: {
      ...state,
      counters: { ...state.counters, req: state.counters.req + 1 },
      pendingAi: [...state.pendingAi, { reqId, kind, context }],
    },
    effect: { type: 'AI_REQUEST', reqId, kind, context },
  };
}

/**
 * AI 結果通過 gateway 後仍然唔符合 engine 嘅語意檢查（例如講咗未授權嘅 token）：
 * 視為 AI 失敗——暫停、保留 pending 以便玩家重試、即時存檔（spec §21）。
 * 唔會套用任何 AI 內容。
 */
export function rejectAiResult(state: GameState, pending: PendingAiRequest): Reduction {
  return {
    state: {
      ...state,
      pendingAi: [...state.pendingAi.filter((p) => p.reqId !== pending.reqId), pending],
      paused: { by: 'ai-failure', reqId: pending.reqId },
    },
    effects: [{ type: 'SAVE', target: { kind: 'AI_FAILURE' }, reason: 'AI_FAILURE' }],
  };
}
