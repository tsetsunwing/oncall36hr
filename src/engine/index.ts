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
export { gameSecondsPerRealMs, pendingPausesClock } from './core/clock';
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
  type PausedState,
  type PlayerRank,
} from './core/state';
export { ordersModule, isCancellable } from './orders/orders';
export { aclsModule } from './acls/aclsModule';
export { deathModule, COMPLETE_STEP_INTENT, DEATH_MODULE } from './death/deathModule';
export { deathModelOf } from './death/death';
export {
  aclsModelOf,
  causeRowsOf,
  computeRoscProbability,
  doseMatches,
  rhythmOf,
  type RoscBreakdown,
  type RoscInputs,
} from './acls/model';
export { postRoscBundleDone } from './acls/arrest';
export type { Death, Resus } from './acls/resusState';
export { SUBSCORE_IDS, type LedgerEntry, type SubscoreCode } from './score/ledgerTypes';
export { applyRule, ledgerRules, subscoreSum } from './score/scoring';
export {
  gradeOf,
  summariseRun,
  worseGrade,
  type DeathSummary,
  type RunSummary,
  type SubscoreSummary,
} from './score/grading';
export {
  buildReview,
  WHAT_IF_RULES,
  type DeathReviewItem,
  type GuidelineItem,
  type GuidelineStatus,
  type ReviewData,
  type ReviewEntry,
  type ReviewPatientRef,
  type SafetyReasonItem,
  type TimelineItem,
  type TimelineKind,
  type WhatIfItem,
} from './review/review';
export type { Grade } from './case/tables';
export { beginCprSlow, endCprSlow, interruptSpeed } from './core/clock';
export { gateModule } from './gate/gate';
export { resultsModule } from './results/results';
export { gateRecordSchema, type GateRecord, type GatePhase, type GateRole } from './gate/gateTypes';
export type { PatientReport } from './case/patient';
export { bedsideModule } from './bedside/bedside';
export { caseModule } from './case/caseModule';
export { composeOrderLabel } from './orders/label';
export { matchQuickPhrase, normalizePhrase } from './orders/quickPhrase';
export { meanArterialPressure, computeMews, type MewsResult } from './case/mews';
export type { Patient, VitalsSample } from './case/patient';
export {
  CONCERN_CATEGORIES,
  DEATH_STEP_IDS,
  EMPTY_TABLES,
  MEWS_COMPONENT_KEYS,
  VITAL_KEYS,
} from './case/tables';
export type {
  AclsAction,
  AclsCauseRow,
  AclsModelRow,
  AclsRhythmRow,
  AclsRow,
  CaseFsmRow,
  DeathModelRow,
  DeathRow,
  DeathStepId,
  DeathStepRow,
  CaseTemplateRow,
  ConcernCategory,
  ConsequenceRow,
  DangerLevel,
  ExecutorKind,
  EngineTables,
  FormularyRow,
  MewsAlert,
  MewsComponentKey,
  MewsRow,
  NurseRosterRow,
  OrderCatalogRow,
  OrderEffectRow,
  QuickWordRow,
  ResultRow,
  RhythmRow,
  TrajectoryRow,
  VitalKey,
} from './case/tables';
export type { ChatLine, ChatThread, Present, SpeakerKind } from './chat/chatTypes';
export {
  renderTemplate,
  extractTokens,
  validateTemplate,
  hasBareNumber,
  leaksDiagnosis,
} from './chat/tokens';
export { parseMentions } from './chat/mentions';
export {
  typingSpeakerIds,
  abnormalOf,
  vitalTokens,
  type Abnormal,
  type Beat,
} from './chat/dialogue';
export type { ActionLogEntry } from './log/actionLog';
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
export { wardModule } from './ward/wardModule';
export { subordinateOrderModule } from './ward/delegation';
export { nurseForBed } from './ward/nurses';
export { reachableRanks, skippedRanks } from './ward/consult';
export { plannedCallCount, shiftSeconds } from './ward/generate';
export {
  CALL_RESPONSES,
  DELEGATION_TASKS,
  RANKS,
  wardStateSchema,
  type Call,
  type CallLine,
  type CallResponse,
  type CallTarget,
  type DelegationTaskId,
  type Rank,
  type Sbar,
  type WardState,
  type WardTask,
} from './ward/wardTypes';
export type {
  CallTemplateRow,
  DelegationResultRow,
  DifficultyProfileRow,
  SubordinateRow,
  WardLayoutRow,
} from './case/tables';
export {
  ENERGY_TICK_EVENT,
  OVERTIME_DEADLINE_EVENT,
  SHIFT_END_EVENT,
  SHIFT_MODULE,
  shiftIntent,
  shiftModule,
} from './shift/shiftModule';
export {
  ENDING_REASONS,
  ROUND_PHASES,
  ROUND_VERDICTS,
  SELF_CARE_ID_LIST,
  emptyShift,
  shiftSchema,
  type Ending,
  type EndingReasonId,
  type RoundActive,
  type RoundCurrent,
  type RoundPhase,
  type RoundResult,
  type RoundVerdict,
  type ShiftState,
} from './shift/shiftState';
export {
  activeMeal,
  mealNodes,
  overtimeEndOf,
  regularSecondsOf,
  roundTimes,
  segmentAt,
  segmentsOf,
  startHourOf,
  type MealNode,
  type Segment,
  type SegmentKind,
  type TimelineConfig,
} from './shift/timeline';
export { energyLevel, energyModel, type EnergyLevel } from './shift/energy';
export { patientNeedsHandover, workInFlight } from './shift/handover';
export {
  HINT_COUNT,
  ROUNDS_GRADE_KIND,
  ROUNDS_QUESTION_KIND,
  roundTextOk,
  topicById,
} from './shift/rounds';
export {
  mealWindowFor,
  selfCareAvailable,
  selfCareCooldownLeft,
  selfCareRow,
} from './shift/selfCare';
export { interruptsSuppressed, overtimeFrozen, roundInProgress } from './shift/suppress';
export type { EnergyModelRow, RoundTopicRow, SelfCareRow } from './case/tables';
