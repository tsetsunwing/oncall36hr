/**
 * M4 收緊嘅內容表 schema（implementation-plan §5：T12、T13、T15、T16、T17、T18、T22 部分、T24、T28）。
 * 臨床／平衡數值冇來源就保持佔位，並標 reviewStatus: PENDING_CLINICAL_REVIEW。
 */
import { z } from 'zod';

const id = z.string().min(1);
const probability = z.number().min(0).max(1);
const reviewStatus = z.enum(['PENDING_CLINICAL_REVIEW', 'REVIEWED']);

export const PLAYER_RANK_IDS = ['HO', 'MO', 'RES'] as const;
export const RANK_IDS = ['HO', 'MO', 'RES', 'AC', 'COS'] as const;
export const DIFFICULTY_IDS = ['EASY', 'MEDIUM', 'HARD'] as const;
export const SUBSCORES = [
  'CLINICAL_OUTCOME',
  'TIMELINESS',
  'SAFETY',
  'COMMUNICATION',
  'PRIORITISATION',
  'SELF_CARE',
] as const;
export const PRIORITIES = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;
export const IMPRESSION_BANDS = ['WARM', 'NEUTRAL', 'COLD'] as const;
export const LEVELS = ['NOVICE', 'NORMAL', 'SENIOR'] as const;
export const DELEGATION_TASKS = [
  'PROCEDURE',
  'ORDER_NOTE',
  'ADMISSION',
  'SIMPLE_CALL',
  'ROUND_PREP',
] as const;
export const FAILURE_MODES = ['DELAYED', 'INCOMPLETE', 'WRONG'] as const;
export const CALL_TAGS = ['NURSE', 'JUNIOR', 'LAB', 'XRAY', 'PHARMACY', 'DEPT'] as const;
export const CALL_NEEDS = [
  'NONE',
  'ANY_PATIENT',
  'WORST_PATIENT',
  'ABNORMAL_REPORT',
  'FREE_BED',
] as const;

/** T12 difficulty-profiles */
export const difficultyProfileSchema = z
  .object({
    id: z.enum(DIFFICULTY_IDS),
    occupancy: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
      .strict()
      .refine((o) => o.min <= o.max, 'min 不可大於 max'),
    complexityLevel: z.number().int().min(1).max(3),
    complexRatio: probability,
    phoneVolumeUplift: z.number().min(0),
    nightEventMultiplier: z.number().positive(),
    nurseSeniority: z.enum(['SENIOR', 'NORMAL', 'NEW']),
    reviewStatus,
  })
  .strict();

/** T13 rank-complexity */
export const rankComplexitySchema = z
  .object({
    id: z.enum(PLAYER_RANK_IDS),
    complexityLevel: z.number().int().min(1).max(3),
    reviewStatus,
  })
  .strict();

/** T15 subordinates：level 係隱藏變數（S-8 A），只留喺 engine，永遠唔入 view／AI */
export const subordinateSchema = z
  .object({
    id,
    rank: z.enum(['HO', 'MO']),
    name: z.string().min(1),
    level: z.enum(LEVELS),
    tone: z.string().min(1),
  })
  .strict();

const delegationItemSchema = z
  .object({
    id,
    label: z.string().min(1),
    catalogId: id.optional(),
    baseDurationSec: z.number().int().positive().optional(),
    needsPatient: z.boolean(),
    needsTag: z.string().optional(),
    setsFlag: z.string().optional(),
    clearsTag: z.string().optional(),
  })
  .strict();

/** T16 delegation-results：按任務類型；成功率／速度喺 config.staff（spec S32d），呢度只管失敗型態同回報 */
export const delegationResultSchema = z
  .object({
    id: z.enum(DELEGATION_TASKS),
    task: z.enum(DELEGATION_TASKS),
    items: z.array(delegationItemSchema).min(1),
    byLevel: z
      .object({
        NOVICE: z.object({ failureModes: z.array(z.enum(FAILURE_MODES)).min(1) }).strict(),
        NORMAL: z.object({ failureModes: z.array(z.enum(FAILURE_MODES)).min(1) }).strict(),
        SENIOR: z.object({ failureModes: z.array(z.enum(FAILURE_MODES)).min(1) }).strict(),
      })
      .strict(),
    delayExtraMultiplier: z.number().positive(),
    reviewStatus,
  })
  .strict();

const callResponseEffectSchema = z
  .object({
    events: z.array(id),
    setFlags: z.array(id),
    goToBed: z.boolean(),
  })
  .strict();

/** T17 call-templates（kind CALL）同 SBAR 預填模板（kind SBAR_PREFILL） */
export const callTemplateSchema = z
  .object({
    id,
    kind: z.literal('CALL'),
    tag: z.enum(CALL_TAGS),
    weight: z.number().positive(),
    priority: z.enum(PRIORITIES),
    needs: z.enum(CALL_NEEDS),
    playerRanks: z.array(z.enum(PLAYER_RANK_IDS)).min(1),
    text: z.string().min(1),
    sbar: z
      .object({ S: z.string(), B: z.string(), A: z.string(), R: z.string() })
      .strict()
      .optional(),
    delegable: z.boolean(),
    admission: z.boolean().optional(),
    deptPool: z.array(id).optional(),
    responses: z
      .object({
        GO_NOW: callResponseEffectSchema,
        LATER: callResponseEffectSchema,
        CONTINUE: callResponseEffectSchema,
        MISSED: callResponseEffectSchema,
      })
      .strict(),
    callerImpression: z.enum(['NONE', 'CALLER_RANK']),
    reviewStatus,
  })
  .strict();

export const sbarPrefillSchema = z
  .object({
    id,
    kind: z.literal('SBAR_PREFILL'),
    S: z.string().min(1),
    B: z.string().min(1),
    A: z.string().min(1),
    R: z.string().min(1),
    RByTarget: z.object({ RANK: z.string().min(1), DEPT: z.string().min(1) }).strict(),
    abnormalLabels: z.record(id, z.string()),
    directionLabels: z.object({ LOW: z.string(), HIGH: z.string() }).strict(),
    sexLabels: z.object({ M: z.string().min(1), F: z.string().min(1) }).strict(),
    noAbnormal: z.string().min(1),
    noAllergy: z.string().min(1),
    noOrders: z.string().min(1),
    reviewStatus,
  })
  .strict();

/** 病人喺非床邊位置心臟停頓：護士打嚟嘅固定來電（M4b）；回應同普通來電一樣 */
export const arrestAlertSchema = z
  .object({
    id,
    kind: z.literal('ARREST_ALERT'),
    text: z.string().min(1),
    rearrestText: z.string().min(1),
    responses: z
      .object({
        GO_NOW: callResponseEffectSchema,
        LATER: callResponseEffectSchema,
        CONTINUE: callResponseEffectSchema,
        MISSED: callResponseEffectSchema,
      })
      .strict(),
    reviewStatus,
  })
  .strict();

/** 死亡通知上級用嘅 SBAR 預填（全部由 state 映射，唔係 AI） */
export const deathSbarSchema = z
  .object({
    id,
    kind: z.literal('DEATH_SBAR'),
    S: z.string().min(1),
    B: z.string().min(1),
    A: z.string().min(1),
    R: z.string().min(1),
    reviewStatus,
  })
  .strict();

export const callOrSbarSchema = z.discriminatedUnion('kind', [
  callTemplateSchema,
  sbarPrefillSchema,
  arrestAlertSchema,
  deathSbarSchema,
]);

const bandRowSchema = z
  .object({
    reactionSec: z.number().int().min(0),
    adviceMinClarity: z.number().int().min(0).max(3),
    bedsideMinClarity: z.number().int().min(0).max(3),
    questionDepth: z.number().int().min(0).max(3),
  })
  .strict();

/** T18 rank-behaviour：被致電嘅職級 × 印象段 → 反應時間、幫手門檻、問題深度 */
export const rankBehaviourSchema = z
  .object({
    id: z.enum(['MO', 'RES', 'AC', 'COS']),
    bands: z.object({ WARM: bandRowSchema, NEUTRAL: bandRowSchema, COLD: bandRowSchema }).strict(),
    reviewStatus,
  })
  .strict();

/** T24 consult-departments */
export const consultDepartmentSchema = z
  .object({
    id,
    label: z.string().min(1),
    kind: z.enum(['SPECIALTY', 'ICU', 'SERVICE']),
    acceptMinClarity: z.number().int().min(0).max(3),
    bedsideByUrgency: z
      .object({
        ROUTINE: z.enum(['PHONE', 'BEDSIDE']),
        URGENT: z.enum(['PHONE', 'BEDSIDE']),
        EMERGENCY: z.enum(['PHONE', 'BEDSIDE']),
      })
      .strict(),
    reactionSec: z
      .object({ PHONE: z.number().int().min(0), BEDSIDE: z.number().int().min(0) })
      .strict(),
    icu: z
      .object({ mewsMin: z.number().int().min(0), assessSec: z.number().int().positive() })
      .strict()
      .optional(),
    incoming: z.boolean(),
    reviewStatus,
  })
  .strict();

/** T22 scoring-rules（M4 子集）：事件碼 → 分項＋固定分值；impression 為各職級內部評價升降 */
export const scoringRuleSchema = z
  .object({
    id,
    subscore: z.enum(SUBSCORES),
    delta: z.number(),
    impression: z
      .object({ target: z.enum(['SKIPPED', 'CALLEE', 'CALLER']), delta: z.number() })
      .strict()
      .optional(),
    reviewStatus,
  })
  .strict();

const bedRowSchema = z
  .object({
    id,
    kind: z.literal('BED'),
    bed: z.number().int().positive(),
    zone: id,
    row: z.number().int().min(0),
    col: z.number().int().min(0),
  })
  .strict();
const landmarkRowSchema = z
  .object({
    id,
    kind: z.literal('LANDMARK'),
    landmark: z.enum(['STATION', 'PHONE', 'PANTRY', 'REST', 'WC', 'CLOCK']),
  })
  .strict();
const walkRowSchema = z
  .object({
    id,
    kind: z.literal('WALK'),
    sameZoneSec: z.number().int().min(0),
    crossZoneSec: z.number().int().min(0),
    reviewStatus,
  })
  .strict();

/** T28 ward-layout：20 床座標、分區、區間行走時間 */
export const wardLayoutSchema = z.discriminatedUnion('kind', [
  bedRowSchema,
  landmarkRowSchema,
  walkRowSchema,
]);
