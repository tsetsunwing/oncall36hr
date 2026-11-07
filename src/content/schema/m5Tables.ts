/**
 * M5 收緊嘅內容表 schema：T9 acls-transitions（含 H's and T's 病因列）、T23 death-process。
 * 呢啲表嘅機率、懲罰、劑量、能量、時間門檻全部係遊戲平衡用嘅佔位值，一律標 PENDING_CLINICAL_REVIEW，
 * 唔代表任何臨床數據（implementation-plan R6）；邏輯內唔內置任何數字。
 */
import { z } from 'zod';
import { id, REVIEW_STATUSES } from './m2Tables';

const probability = z.number().min(0).max(1);
const nonNegative = z.number().min(0);
const reviewStatus = z.enum(REVIEW_STATUSES);

const weightedRhythms = z.array(z.object({ rhythm: id, w: z.number().positive() }).strict()).min(1);

const doseSchema = z.object({ value: z.number().positive(), unit: z.string().min(1) }).strict();

/** 每個搶救節律嘅轉移（T9）：ROSC 基礎機率、冇 ROSC 時下一個節律嘅權重 */
export const aclsRhythmRowSchema = z
  .object({
    id,
    kind: z.literal('RHYTHM'),
    rhythm: id,
    /** 搶救期間呢個節律用嘅 trajectory（取樣時覆蓋 case FSM 狀態） */
    trajectory: id,
    rocBaseP: probability,
    ifNoShock: weightedRhythms,
    ifShocked: weightedRhythms,
    reviewStatus,
    note: z.string(),
  })
  .strict();

export const aclsModelRowSchema = z
  .object({
    id,
    kind: z.literal('MODEL'),
    reviewStatus,
    note: z.string(),
    rosc: z.object({ min: probability, max: probability }).strict(),
    noFlow: z
      .object({
        graceSec: nonNegative,
        penaltyPerMin: nonNegative,
        cap: probability,
      })
      .strict(),
    handsOff: z
      .object({
        graceSec: nonNegative,
        penaltyPer10Sec: nonNegative,
        cap: probability,
      })
      .strict(),
    duration: z.object({ penaltyPerCycle: nonNegative, cap: probability }).strict(),
    shock: z
      .object({
        defaultEnergyJ: z.number().positive(),
        minEnergyJ: z.number().positive(),
        maxEnergyJ: z.number().positive(),
        appropriateBonus: nonNegative,
        missedPenalty: nonNegative,
        inappropriatePenalty: nonNegative,
        wrongEnergyPenalty: nonNegative,
        delayGraceSec: nonNegative,
        delayPenaltyPerMin: nonNegative,
        delayCap: probability,
      })
      .strict(),
    drugs: z.array(
      z
        .object({
          formularyId: id,
          dose: doseSchema,
          needsShockable: z.boolean(),
          minShocksBefore: z.number().int().min(0),
          bonus: nonNegative,
          wrongDosePenalty: nonNegative,
        })
        .strict(),
    ),
    causes: z.object({ treatedBonus: nonNegative, cap: probability }).strict(),
    airway: z.object({ flag: id, bonus: nonNegative }).strict(),
    unsalvageableCap: probability,
    afterRosc: weightedRhythms,
    postRosc: z
      .object({
        windowSec: z.number().positive(),
        bundle: z.array(
          z
            .object({
              id,
              label: z.string().min(1),
              catalogIds: z.array(id).min(1),
            })
            .strict(),
        ),
        rearrestBaseP: probability,
        rearrestPerMissing: nonNegative,
        rearrestRhythms: weightedRhythms,
      })
      .strict(),
    scoring: z
      .object({
        timeToCpr: z.object({ graceSec: nonNegative }).strict(),
        timeToFirstShock: z.object({ graceSec: nonNegative }).strict(),
        cycleGap: z.object({ graceSec: nonNegative }).strict(),
      })
      .strict(),
  })
  .strict();

/** H's and T's：每個可逆病因嘅檢查 order 同處理 order（catalog id） */
export const aclsCauseRowSchema = z
  .object({
    id,
    kind: z.literal('CAUSE'),
    label: z.string().min(1),
    group: z.enum(['H', 'T']),
    checkCatalogIds: z.array(id),
    treatCatalogIds: z.array(id).min(1),
    reviewStatus,
    note: z.string(),
  })
  .strict();

export const aclsTransitionSchema = z.discriminatedUnion('kind', [
  aclsRhythmRowSchema,
  aclsModelRowSchema,
  aclsCauseRowSchema,
]);

export const DEATH_STEPS = ['CERTIFICATE', 'NOTIFY_SENIOR', 'PHONE_FAMILY', 'RECORD'] as const;

export const DEATH_PREFILL_FIELDS = [
  'name',
  'ageSex',
  'bed',
  'timeOfDeath',
  'cause',
  'seniorRank',
  'resusSummary',
] as const;

export const deathModelRowSchema = z
  .object({
    id,
    kind: z.literal('MODEL'),
    reviewStatus,
    note: z.string(),
    /** 死亡流程未完成，每隔幾耐扣一次分 */
    delayIntervalSec: z.number().int().positive(),
    /** 「通知上一級」：按玩家職級決定固定目標（S16 A） */
    seniorByRank: z.object({ HO: id, MO: id, RES: id }).strict(),
  })
  .strict();

export const deathStepRowSchema = z
  .object({
    id,
    kind: z.literal('STEP'),
    step: z.enum(DEATH_STEPS),
    /** 預填欄位（由 engine／view 按病例資料映射，玩家只需確認） */
    fields: z.array(z.enum(DEATH_PREFILL_FIELDS)),
    reviewStatus,
    note: z.string(),
  })
  .strict();

export const deathProcessSchema = z.discriminatedUnion('kind', [
  deathModelRowSchema,
  deathStepRowSchema,
]);
