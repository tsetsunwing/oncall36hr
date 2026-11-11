/**
 * M3 收緊嘅內容表 schema：T7 results、T11 consequences。
 * 兩張表嘅臨床數值於臨床審核前一律標 PENDING_CLINICAL_REVIEW（implementation-plan R6）。
 */
import { z } from 'zod';
import { id, partialVitalDelta, REVIEW_STATUSES } from './m2Tables';

export const CONCERN_CATEGORIES = [
  'ALLERGY',
  'INTERACTION',
  'DOSE_HIGH',
  'DOSE_LOW',
  'WRONG_ROUTE',
  'CONTRAINDICATION',
  'OTHER',
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

export const DANGER_LEVELS = ['LOW', 'MID', 'HIGH'] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

export const CONSEQUENCE_MODES = ['IMMEDIATE', 'DELAYED', 'REVIEW_ONLY'] as const;
export type ConsequenceMode = (typeof CONSEQUENCE_MODES)[number];

const resultItemSchema = z
  .object({
    id,
    label: z.string().min(1),
    unit: z.string(),
    decimals: z.number().int().min(0).max(3),
    ref: z.object({ low: z.number(), high: z.number() }).strict(),
    /** 按 case FSM 狀態；'*' ＝ 任何狀態嘅後備值 */
    byState: z.record(z.string().min(1), z.number()),
    /** 按診斷 id 再細分；入面同樣用狀態名，'*' ＝ 該診斷任何狀態 */
    byDiagnosis: z.record(z.string().min(1), z.record(z.string().min(1), z.number())).optional(),
  })
  .strict();

const resultTextSchema = z
  .object({
    /** 可含 {{vital.hr}}、{{rhythm.label}} 等狀態 token（報告時由 engine 解析） */
    text: z.string().min(1),
    abnormal: z.boolean(),
  })
  .strict();

/**
 * T7 results：化驗（PANEL，逐項數值＋參考範圍＋H／L）同報告類（REPORT，文字）。
 * `reportDelaySec`：由 order 完成（已抽血／已拍攝）起計到報告出嚟嘅延遲。
 */
export const resultSchema = z
  .object({
    id,
    kind: z.enum(['PANEL', 'REPORT']),
    label: z.string().min(1),
    reportDelaySec: z.number().int().min(0),
    reviewStatus: z.enum(REVIEW_STATUSES),
    note: z.string(),
    items: z.array(resultItemSchema),
    textByState: z.record(z.string().min(1), resultTextSchema),
    /** 按診斷 id 再細分報告文字；'*' ＝ 該診斷任何狀態 */
    textByDiagnosis: z
      .record(z.string().min(1), z.record(z.string().min(1), resultTextSchema))
      .optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (
      row.kind === 'PANEL' &&
      (row.items.length === 0 || Object.keys(row.textByState).length > 0)
    ) {
      ctx.addIssue({ code: 'custom', message: 'PANEL 必須有 items 而且冇 textByState' });
    }
    if (row.kind === 'REPORT' && (row.items.length > 0 || !('*' in row.textByState))) {
      ctx.addIssue({
        code: 'custom',
        message: 'REPORT 必須有 textByState["*"] 後備文字而且冇 items',
      });
    }
  });

const effectSchema = z
  .object({
    delta: partialVitalDelta,
    delaySec: z.number().int().min(0),
    rampSec: z.number().int().min(1),
    durationSec: z.number().int().positive().nullable(),
    setsFlags: z.array(id),
  })
  .strict();

const levelSchema = z
  .object({
    p: z.number().min(0).max(1),
    mode: z.enum(CONSEQUENCE_MODES),
    delayMinSec: z.number().int().min(0).optional(),
    delayMaxSec: z.number().int().min(0).optional(),
    effect: effectSchema.nullable(),
  })
  .strict()
  .superRefine((level, ctx) => {
    if (level.mode === 'REVIEW_ONLY' && level.effect !== null) {
      ctx.addIssue({ code: 'custom', message: 'REVIEW_ONLY 唔可以有即時效果' });
    }
    if (level.mode !== 'REVIEW_ONLY' && level.effect === null) {
      ctx.addIssue({ code: 'custom', message: `${level.mode} 必須有 effect` });
    }
    if (level.mode === 'DELAYED') {
      const { delayMinSec: min, delayMaxSec: max } = level;
      if (min === undefined || max === undefined || max < min) {
        ctx.addIssue({ code: 'custom', message: 'DELAYED 必須有 delayMinSec ≤ delayMaxSec' });
      }
    } else if (level.delayMinSec !== undefined || level.delayMaxSec !== undefined) {
      ctx.addIssue({ code: 'custom', message: '只有 DELAYED 可以設 delay' });
    }
  });

/** T11 consequences：(concern category × danger) → 固定機率、模式、效果。AI 唔參與擲骰。 */
export const consequenceSchema = z
  .object({
    id,
    category: z.enum(CONCERN_CATEGORIES),
    reviewStatus: z.enum(REVIEW_STATUSES),
    note: z.string(),
    levels: z.object({ LOW: levelSchema, MID: levelSchema, HIGH: levelSchema }).strict(),
  })
  .strict();

/**
 * T7b lab-baselines：每項化驗嘅正常值基準，分性別同性別長者偏差。
 * 診斷有指定值嘅項目唔用呢個基準（見 results 的 byDiagnosis）。
 */
export const labBaselineSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    unit: z.string(),
    decimals: z.number().int().min(0).max(3),
    ref: z.object({ low: z.number(), high: z.number() }).strict(),
    typical: z.object({ M: z.number(), F: z.number() }).strict(),
    /** 70 歲或以上加落去嘅偏差 */
    elderlyDelta: z.number(),
  })
  .strict();
