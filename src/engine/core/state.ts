/**
 * GameState：可序列化快照嘅單一真相（implementation-plan §4.1、§12.1）。
 * 純 JSON：冇函數、冇 Date、冇 undefined（可選值一律用 null）。
 * M1 只包含 core 部分；病人、護士、電話等於後續 milestone 加入並升 schema＋寫 migration。
 */
import { z } from 'zod';
import { eventQueueSchema, type EventQueue } from './eventQueue';
import { createEventQueue, enqueue } from './eventQueue';
import { createRngState, rngStateSchema } from './rng';
import { deathSchema, resusSchema } from '../acls/resusState';
import { patientSchema } from '../case/patient';
import { chatThreadSchema } from '../chat/chatTypes';
import { actionLogEntrySchema } from '../log/actionLog';
import { orderSchema } from '../orders/orderTypes';
import { ledgerEntrySchema } from '../score/ledgerTypes';
import { emptyPriority, prioritySchema } from '../score/priorityState';
import { emptyShift, shiftSchema } from '../shift/shiftState';
import { emptyWard, wardStateSchema } from '../ward/wardTypes';
import type { EngineConfig } from './config';

export const CURRENT_SCHEMA = 11;

export const MODES = ['DAY', 'NIGHT', 'ONCALL'] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const PLAYER_RANKS = ['HO', 'MO', 'RES'] as const;
export const PHASES = ['REGULAR', 'OVERTIME', 'HANDOVER', 'ENDED'] as const;

export type Mode = (typeof MODES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type PlayerRank = (typeof PLAYER_RANKS)[number];

export const AUTOSAVE_EVENT_KIND = 'AUTOSAVE';
export const AUTOSAVE_PRIORITY = 100;

const clockSchema = z
  .object({
    t: z.number().int().min(0),
    frac: z.number().min(0).lt(1),
    speed: z.number().positive(),
    cprSlow: z.boolean(),
    phase: z.enum(PHASES),
  })
  .strict();

const pausedSchema = z
  .object({
    by: z.enum(['player', 'ai-failure', 'forced']),
    reqId: z.string().nullable(),
  })
  .strict();

const pendingAiSchema = z
  .object({
    reqId: z.string().min(1),
    kind: z.string().min(1),
    context: z.json(),
  })
  .strict();

export const gameStateSchema = z
  .object({
    schema: z.literal(CURRENT_SCHEMA),
    seed: z.string(),
    mode: z.enum(MODES),
    difficulty: z.enum(DIFFICULTIES),
    playerRank: z.enum(PLAYER_RANKS),
    /** 開局時由設定頁帶入嘅玩法選項（engine 唔讀 localStorage） */
    options: z.object({ nurseConfirmHighRisk: z.boolean() }).strict(),
    rng: rngStateSchema,
    clock: clockSchema,
    paused: pausedSchema.nullable(),
    orders: z.record(z.string(), orderSchema),
    patients: z.record(z.string(), patientSchema),
    chats: z.record(z.string(), chatThreadSchema),
    actionLog: z.array(actionLogEntrySchema),
    counters: z
      .object({
        order: z.number().int().min(0),
        req: z.number().int().min(0),
        line: z.number().int().min(0),
        log: z.number().int().min(0),
      })
      .strict(),
    scheduler: eventQueueSchema,
    pendingAi: z.array(pendingAiSchema),
    ward: wardStateSchema,
    /** M5：最近一次心臟停頓（搶救）嘅進行／結果；未發生過為 null */
    resus: resusSchema.nullable(),
    /** M5：死亡流程；病人未死為 null。流程完成前床位不釋放 */
    death: deathSchema.nullable(),
    /** M7：唯一計分 ledger（六分項共用、只增不減；回顧由此加 action log 重建） */
    scoreLedger: z.array(ledgerEntrySchema),
    /** M6：巡房、精力、自我照顧、超時同交更結局 */
    shift: shiftSchema,
    /** M7：優先次序追蹤（最近一次處理每個病人嘅時刻） */
    priority: prioritySchema,
  })
  .strict();

export type GameState = z.infer<typeof gameStateSchema>;
export type PendingAiRequest = GameState['pendingAi'][number];
export type PausedState = NonNullable<GameState['paused']>;

export interface NewGameParams {
  seed: string;
  mode: Mode;
  difficulty: Difficulty;
  playerRank: PlayerRank;
  /** 護士高風險 order 先確認（設定頁開關，spec §13、§21）；預設開 */
  nurseConfirmHighRisk?: boolean;
  /** 指定 case 模板 id；唔填就用 content 第一個 case（M2 只有一個） */
  caseId?: string;
  /** M4：生成 20 床病房、電話同下屬；唔填＝舊式單一病人（p1，7 號床） */
  ward?: boolean;
  /** 病房模式下，指定其中一個病人用呢個 case 模板（測試與預覽用）；未知 id 忽略 */
  wardCaseId?: string;
}

export function createInitialState(params: NewGameParams, config: EngineConfig): GameState {
  const intervalSec = Math.round(config.saves.autoSaveEveryGameMinutes * 60);
  const scheduler: EventQueue = enqueue(createEventQueue(), {
    time: intervalSec,
    priority: AUTOSAVE_PRIORITY,
    kind: AUTOSAVE_EVENT_KIND,
  });
  return {
    schema: CURRENT_SCHEMA,
    seed: params.seed,
    mode: params.mode,
    difficulty: params.difficulty,
    playerRank: params.playerRank,
    options: { nurseConfirmHighRisk: params.nurseConfirmHighRisk ?? true },
    rng: createRngState(params.seed),
    clock: {
      t: 0,
      frac: 0,
      speed: config.clock.defaultSpeed > 0 ? config.clock.defaultSpeed : 1,
      cprSlow: false,
      phase: 'REGULAR',
    },
    paused: null,
    orders: {},
    patients: {},
    chats: {},
    actionLog: [],
    counters: { order: 0, req: 0, line: 0, log: 0 },
    scheduler,
    pendingAi: [],
    ward: emptyWard(),
    resus: null,
    death: null,
    scoreLedger: [],
    shift: emptyShift(),
    priority: emptyPriority(),
  };
}
