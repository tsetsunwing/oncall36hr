/**
 * M7 內容表：T22b scoring-model（評級門檻、死亡降級、AI 安全分級、優先次序時間窗）、
 * T1b required-actions（每個 case 嘅必要處置時間窗＋指引對照）。
 * 全部數值係平衡佔位值，標 PENDING_CLINICAL_REVIEW；指引文字未核實來源。
 */
import { z } from 'zod';
import { id, REVIEW_STATUSES } from './m2Tables';

const reviewStatus = z.enum(REVIEW_STATUSES);

export const GRADES = ['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_IMPROVEMENT'] as const;

const gradingThresholds = z
  .object({ excellentMin: z.number(), goodMin: z.number(), fairMin: z.number() })
  .strict()
  .refine((t) => t.excellentMin >= t.goodMin && t.goodMin >= t.fairMin, '門檻必須由高到低');

export const scoringModelSchema = z
  .object({
    id: z.literal('MODEL'),
    /** 每個分項各自按原始加總評級（冇總分、冇倍數）：加總 ≥ excellentMin → 優秀，如此類推 */
    grading: z
      .object({
        CLINICAL_OUTCOME: gradingThresholds,
        TIMELINESS: gradingThresholds,
        SAFETY: gradingThresholds,
        COMMUNICATION: gradingThresholds,
        PRIORITISATION: gradingThresholds,
        SELF_CARE: gradingThresholds,
      })
      .strict(),
    /** 死亡降級：任何一宗死亡令「臨床結果」最高只得 oneDeathCap；死亡比例 ≥ needsImprovementFraction 則最高「需改善」 */
    deathCap: z
      .object({
        oneDeathCap: z.enum(GRADES),
        needsImprovementFraction: z.number().min(0).max(1),
      })
      .strict(),
    /** 藥房 AI 安全評分（0 至 10）分級：≥ goodMin 好、≤ poorMax 差、其餘一般 */
    safetyScore: z
      .object({
        goodMin: z.number().int().min(0).max(10),
        poorMax: z.number().int().min(0).max(10),
      })
      .strict()
      .refine((s) => s.poorMax < s.goodMin, 'poorMax 必須細過 goodMin'),
    /** C5 A：優先次序——病人（或來電）緊急度升級後，超過 graceSec 未處理先算被忽略 */
    priority: z.object({ graceSec: z.number().int().positive() }).strict(),
    /** 回顧「已盡力」：salvageable ＝ false 嘅病人死亡 */
    reviewStatus,
    note: z.string(),
  })
  .strict();

/** T1b：必要處置（case FSM 狀態內，由進入該狀態起計時間窗），附指引對照 */
export const requiredActionSchema = z
  .object({
    id,
    fsmId: id,
    state: id,
    flag: id,
    label: z.string().min(1),
    catalogIds: z.array(id).min(1),
    windowSec: z.number().int().positive(),
    guideline: z
      .object({
        title: z.string().min(1),
        text: z.string().min(1),
        /** 來源未核實前一律「待核實」 */
        source: z.string().min(1),
      })
      .strict(),
    reviewStatus,
    note: z.string(),
  })
  .strict();
