import type { EngineTables } from '../case/tables';
import type { EngineConfig } from './config';
import type { JsonValue, ScheduledEvent } from './eventQueue';
import type { PlayerIntent, Reduction } from './events';
import type { GameState, NewGameParams, PendingAiRequest } from './state';

export interface EngineContext {
  config: EngineConfig;
  tables: EngineTables;
}

/**
 * Engine 功能模組（orders、之後嘅 case／acls／phone…）。
 * 每個 hook 回傳 undefined 代表「唔係我處理」；第一個回傳 Reduction 嘅模組勝出。
 * Hook 必須係純函數：唔可改傳入 state、唔可用非確定性 API。
 */
export interface EngineModule {
  name: string;
  /** 開局時按順序呼叫，令 module 於初始 state 加入自己嘅資料 */
  init?: (state: GameState, params: NewGameParams, ctx: EngineContext) => GameState;
  handleIntent?: (
    state: GameState,
    intent: PlayerIntent,
    ctx: EngineContext,
  ) => Reduction | undefined;
  /** 所有模組處理完一個玩家 intent 後呼叫（用嚟按「已接受嘅動作」扣精力等）；回傳新 Reduction 或 undefined */
  afterIntent?: (
    before: GameState,
    after: Reduction,
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
    /** 呢個 reqId 發出時登記嘅 pending 請求（reducer 已由 state.pendingAi 移除；未知 reqId 為 undefined） */
    pending: PendingAiRequest | undefined,
  ) => Reduction | undefined;
}
