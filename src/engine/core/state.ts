/**
 * GameState：可序列化快照嘅單一真相（implementation-plan §4.1、§12.1）。
 * 純 JSON：冇函數、冇 Date、冇 undefined（可選值一律用 null）。
 * M1 只包含 core 部分；病人、護士、電話等於後續 milestone 加入並升 schema＋寫 migration。
 */
import { z } from 'zod';
import { eventQueueSchema, type EventQueue } from './eventQueue';
import { createEventQueue, enqueue } from './eventQueue';
import { createRngState, rngStateSchema } from './rng';
import { orderSchema } from '../orders/orderTypes';
import type { EngineConfig } from './config';

export const CURRENT_SCHEMA = 1;

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
    rng: rngStateSchema,
    clock: clockSchema,
    paused: pausedSchema.nullable(),
    orders: z.record(z.string(), orderSchema),
    counters: z.object({ order: z.number().int().min(0), req: z.number().int().min(0) }).strict(),
    scheduler: eventQueueSchema,
    pendingAi: z.array(pendingAiSchema),
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
    counters: { order: 0, req: 0 },
    scheduler,
    pendingAi: [],
  };
}
