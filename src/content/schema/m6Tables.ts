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
export const ENERGY_COST_KEYS = ['ORDER', 'BED', 'CALL'] as const;
export const ENDING_REASONS = ['OVERTIME', 'FAINT'] as const;

/** T25：巡房題範疇只限病史、病理、藥理（spec §8）；答案要點全部由表提供，AI 唔可以引入表外事實 */
export const roundTopicSchema = z
  .object({
    id,
    diagnosisId: id,
    category: z.enum(ROUND_CATEGORIES),
    focus: z.string().min(1),
    keyFacts: z
      .array(
        z
          .object({
            id,
            text: z.string().min(1),
            /** 可選：評分關鍵字。全部 keyFacts 都有 keywords 時，評分唔使 AI（關鍵字比對） */
            keywords: z.array(z.string().min(1)).optional(),
          })
          .strict(),
      )
      .min(2),
    /** 可選：預寫題目。有 question 就出題唔使 AI */
    question: z.string().min(1).optional(),
    /** 可選：預寫提示（配合 question 用） */
    hints: z.array(z.string().min(1)).optional(),
    reviewStatus,
    note: z.string(),
  })
  .strict();

/** T20：精力全部係固定數值（spec §14，S8 B） */
export const energyModelSchema = z
  .object({
    id: z.literal('MODEL'),
    /** 餘量起始：100 − max(startFatigue, startHunger)。內急唔計入暈倒。 */
    startPercent: percent,
    startFatigue: percent,
    startHunger: percent,
    startBladder: percent,
    fatiguePerGameHour: z.number().positive(),
    hungerPerGameHour: z.number().positive(),
    bladderPerGameHour: z.number().positive(),
    tickSeconds: z.number().int().positive(),
    lowPercent: percent,
    veryLowPercent: percent,
    nudgeBelowPercent: percent,
    nudgeCooldownSeconds: z.number().int().min(0),
    actionCosts: z
      .object({
        ORDER: z.number().min(0),
        BED: z.number().min(0),
        CALL: z.number().min(0),
      })
      .strict(),
    /** 地標掣不再套用恢復；房內動作嘅降低量見 self-care-actions。 */
    placeReliefPercent: percent,
    placeCooldownSeconds: z.number().int().min(0),
    /** 茶水間飲水／用膳開始咖啡：期間減慢疲倦、加快內急 */
    coffeeDurationSeconds: z.number().int().min(0),
    coffeeFatigueFactor: z.number().positive(),
    coffeeBladderFactor: z.number().positive(),
    /** 休息室小睡對應嘅遊戲秒數（同 NAP durationSeconds） */
    restVisitSeconds: z.number().int().min(0),
    /** 內急 100% 失禁時額外加上嘅疲倦 */
    bladderAccidentFatigue: z.number().min(0),
    reviewStatus,
    note: z.string(),
  })
  .strict()
  .refine((row) => row.veryLowPercent <= row.lowPercent, 'veryLowPercent 必須細過或等於 lowPercent')
  .refine(
    (row) =>
      row.startPercent ===
      Math.round((100 - Math.max(row.startFatigue, row.startHunger)) * 100) / 100,
    'startPercent 必須等於 100 − max(startFatigue, startHunger)',
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
