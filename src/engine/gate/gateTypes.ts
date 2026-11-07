import { z } from 'zod';
import { CONCERN_CATEGORIES } from '../case/tables';

export const GATE_ROLES = ['PHARMACY', 'NURSE'] as const;
export type GateRole = (typeof GATE_ROLES)[number];

export const GATE_VERDICTS = ['OK', 'CONFIRM', 'OBJECT'] as const;
export type GateVerdict = (typeof GATE_VERDICTS)[number];

/**
 * REVIEW：等緊藥房／護士 AI 回覆；DECISION：有人提出關注，等玩家取消或堅持；
 * RECONFIRM：玩家已堅持一次，把關者要求再確認；RATING：玩家已確認到位，等 AI 評危險度；RELEASED：已放行。
 */
export const GATE_PHASES = ['REVIEW', 'DECISION', 'RECONFIRM', 'RATING', 'RELEASED'] as const;
export type GatePhase = (typeof GATE_PHASES)[number];

const concernSchema = z
  .object({
    category: z.enum(CONCERN_CATEGORIES),
    /** 把關者措辭，內含 {{token}}；發言當刻嘅 token 值已凍結喺 tokenValues */
    line: z.string(),
    tokenValues: z.record(z.string(), z.string()),
  })
  .strict();

const reviewSchema = z
  .object({
    by: z.enum(GATE_ROLES),
    reqId: z.string().min(1),
    status: z.enum(['PENDING', 'DONE']),
    verdict: z.enum(GATE_VERDICTS).nullable(),
    concerns: z.array(concernSchema),
    /** 只有藥房會打分；只供回顧（spec §15、§19.2），遊戲中唔顯示 */
    safety: z
      .object({
        score: z.number().int().min(0).max(10),
        /** 含 {{token}}；數值由 tokenValues 凍結（AI 唔可以直接寫數字） */
        rationale: z.string(),
        tokenValues: z.record(z.string(), z.string()),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const gateRecordSchema = z
  .object({
    phase: z.enum(GATE_PHASES),
    required: z.number().int().min(0).max(2),
    insistCount: z.number().int().min(0).max(2),
    reviews: z.array(reviewSchema),
    danger: z
      .object({
        level: z.enum(['LOW', 'MID', 'HIGH']),
        category: z.enum(CONCERN_CATEGORIES),
        rationale: z.string(),
        tokenValues: z.record(z.string(), z.string()),
      })
      .strict()
      .nullable(),
    /** 玩家堅持到位嗰刻喺 consequence stream 抽好（唔受 AI 回覆次序影響） */
    roll: z
      .object({ value: z.number().min(0).lt(1), delayValue: z.number().min(0).lt(1) })
      .strict()
      .nullable(),
    rolled: z
      .object({
        hit: z.boolean(),
        mode: z.enum(['IMMEDIATE', 'DELAYED', 'REVIEW_ONLY']),
        p: z.number().min(0).max(1),
        delaySec: z.number().int().min(0).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type GateRecord = z.infer<typeof gateRecordSchema>;
export type GateReview = GateRecord['reviews'][number];
