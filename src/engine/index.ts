/**
 * Engine 公開介面。
 * Engine 必須是純 TypeScript：不得 import ai／ui／view／react，
 * 亦不得使用 Math.random、Date、fetch 等非確定性或 I/O API（見 eslint.config.js 與 .dependency-cruiser.cjs）。
 */
export const ENGINE_BOUNDARY_VERSION = 0;

export interface EngineBoundaryInfo {
  version: number;
}

export type { EngineConfig } from './core/config';
export { gameSecondsPerRealMs } from './core/clock';
export {
  createEventQueue,
  enqueue,
  peek,
  pop,
  removeWhere,
  type EventQueue,
  type JsonValue,
  type NewScheduledEvent,
  type ScheduledEvent,
} from './core/eventQueue';
export type {
  AiFailureReason,
  CoreIntent,
  Effect,
  EngineEvent,
  ExtensionIntent,
  NoticeKind,
  PlayerIntent,
  Reduction,
  SaveReason,
  SaveTarget,
} from './core/events';
export { AI_FAILURE_REASONS } from './core/events';
export type { EngineContext, EngineModule } from './core/module';
export {
  createEngine,
  defaultModules,
  prepareLoadedState,
  replay,
  requestAi,
  type Engine,
  type EngineOptions,
} from './core/reducer';
export {
  RNG_STREAMS,
  createRngState,
  rngChance,
  rngFloat,
  rngInt,
  type RngDraw,
  type RngState,
  type RngStream,
} from './core/rng';
export {
  CURRENT_SCHEMA,
  DIFFICULTIES,
  MODES,
  PLAYER_RANKS,
  createInitialState,
  gameStateSchema,
  type Difficulty,
  type GameState,
  type Mode,
  type NewGameParams,
  type PendingAiRequest,
  type PlayerRank,
} from './core/state';
export { ordersModule } from './orders/orders';
export {
  CANCELLABLE_STATUSES,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
} from './orders/orderTypes';
export {
  migrateRawState,
  migrations,
  type Migration,
  type MigrationRegistry,
} from './save/migrations';
export {
  SAVE_FORMAT,
  canonicalStringify,
  deserializeSnapshot,
  serializeSnapshot,
  summarizeState,
  type DeserializeErrorCode,
  type DeserializeResult,
  type SaveSummary,
} from './save/snapshot';
