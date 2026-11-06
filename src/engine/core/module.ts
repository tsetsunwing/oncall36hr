import type { EngineConfig } from './config';
import type { JsonValue, ScheduledEvent } from './eventQueue';
import type { PlayerIntent, Reduction } from './events';
import type { GameState } from './state';

export interface EngineContext {
  config: EngineConfig;
}

/**
 * Engine 功能模組（orders、之後嘅 case／acls／phone…）。
 * 每個 hook 回傳 undefined 代表「唔係我處理」；第一個回傳 Reduction 嘅模組勝出。
 * Hook 必須係純函數：唔可改傳入 state、唔可用非確定性 API。
 */
export interface EngineModule {
  name: string;
  handleIntent?: (
    state: GameState,
    intent: PlayerIntent,
    ctx: EngineContext,
  ) => Reduction | undefined;
  handleScheduled?: (
    state: GameState,
    event: ScheduledEvent,
    ctx: EngineContext,
  ) => Reduction | undefined;
  handleAiResult?: (
    state: GameState,
    reqId: string,
    payload: JsonValue,
    ctx: EngineContext,
  ) => Reduction | undefined;
}
