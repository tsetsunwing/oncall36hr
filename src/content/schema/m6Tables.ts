/**
 * M6 收緊嘅內容表 schema：T20 energy-config、T21 self-care-actions、T25 rounds-topics、T29 endings。
 * 全部數值係平衡佔位值，標 PENDING_CLINICAL_REVIEW；教學內容（key facts）亦待臨床審核。
 */
import { z } from 'zod';
import { id, REVIEW_STATUSES } from './m2Tables';

const reviewStatus = z.enum(REVIEW_STATUSES);
const percent = z.number().min(0).max(100);

export const ROUND_CATEGORIES = ['HISTORY', 'PATHOLOGY', 'PHARMACOLOGY'] as const;
export const SELF_CARE_IDS = ['MEAL', 'NAP', 'TOILET', 'WATER', 'PHONE_CHAT', 'MUSIC'] as const;
export const ENERGY_COST_KEYS = ['MOVE', 'CALL', 'DELEGATE'] as const;
export const ENDING_REASONS = ['OVERTIME', 'FAINT'] as const;

/** T25：巡房題範疇只限病史、病理、藥理（spec §8）；答案要點全部由表提供，AI 唔可以引入表外事實 */
export const roundTopicSchema = z
  .object({
    id,
    diagnosisId: id,
    category: z.enum(ROUND_CATEGORIES),
    focus: z.string().min(1),
    keyFacts: z.array(z.object({ id, text: z.string().min(1) }).strict()).min(2),
    reviewStatus,
    note: z.string(),
  })
  .strict();

/** T20：精力全部係固定數值（spec §14，S8 B） */
export const energyModelSchema = z
  .object({
    id: z.literal('MODEL'),
    startPercent: percent,
    decayPerGameHour: z.number().positive(),
    tickSeconds: z.number().int().positive(),
    lowPercent: percent,
    veryLowPercent: percent,
    nudgeBelowPercent: percent,
    nudgeCooldownSeconds: z.number().int().min(0),
    actionCosts: z
      .object({
        MOVE: z.number().min(0),
        CALL: z.number().min(0),
        DELEGATE: z.number().min(0),
      })
      .strict(),
    reviewStatus,
    note: z.string(),
  })
  .strict()
  .refine(
    (row) => row.veryLowPercent <= row.lowPercent,
    'veryLowPercent 必須細過或等於 lowPercent',
  );

/** T21：自我照顧動作（扣時間、回精力；只有短睡） */
export const selfCareSchema = z
  .object({
    id: z.enum(SELF_CARE_IDS),
    durationSeconds: z.number().int().positive(),
    gainPercent: z.number().min(0),
    requires: z.enum(['NONE', 'MEAL_WINDOW']),
    cooldownSeconds: z.number().int().min(0),
    /** 完成時套用嘅 T22 規則 id */
    rule: id,
    reviewStatus,
    note: z.string(),
  })
  .strict();

/** T29：強制結局標籤（暈倒、超時）；兩者互相獨立，一局只得一個原因 */
export const endingTagSchema = z
  .object({
    id,
    tag: z.enum(ENDING_REASONS),
    reason: z.enum(ENDING_REASONS),
    reviewStatus,
  })
  .strict();
