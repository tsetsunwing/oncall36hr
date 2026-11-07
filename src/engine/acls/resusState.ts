/**
 * 搶救（ACLS）、死亡流程、分數 ledger 嘅存檔 schema（schema v4）。
 * 全部係 engine 擁有嘅事實：AI 只負責將結果講成對白，唔讀亦唔寫呢啲欄位。
 */
import { z } from 'zod';
import { DEATH_STEP_IDS } from '../case/tables';

const time = z.number().int().min(0);

const drugGivenSchema = z
  .object({
    formularyId: z.string().min(1),
    dose: z.object({ value: z.number(), unit: z.string() }).strict().nullable(),
    at: time,
    doseOk: z.boolean(),
  })
  .strict();

/** 兩次評估之間（一個 cycle）累積嘅動作；每次評估後重置 */
const cycleSchema = z
  .object({
    shocksOnShockable: z.number().int().min(0),
    shocksOnNonShockable: z.number().int().min(0),
    wrongEnergy: z.boolean(),
    drugs: z.array(drugGivenSchema),
  })
  .strict();

const rollSchema = z
  .object({
    t: time,
    trigger: z.enum(['SHOCK', 'RHYTHM_CHECK']),
    p: z.number().min(0).max(1),
    success: z.boolean(),
    terms: z.record(z.string(), z.number()),
  })
  .strict();

export const RESUS_STATUSES = ['ARREST', 'ROSC', 'RECOVERED', 'STOPPED'] as const;
export const CPR_STATES = ['NOT_STARTED', 'ACTIVE', 'PAUSED'] as const;

export const resusSchema = z
  .object({
    patientId: z.string().min(1),
    episode: z.number().int().min(1),
    status: z.enum(RESUS_STATUSES),
    onsetAt: time,
    initialRhythm: z.string().min(1),
    rhythm: z.string().min(1),
    /** 真正存在嘅可逆病因（T1）；隱藏，只有處理咗先影響 ROSC 機率 */
    causeIds: z.array(z.string()),
    cpr: z
      .object({
        state: z.enum(CPR_STATES),
        firstAt: time.nullable(),
        cycleStartedAt: time.nullable(),
      })
      .strict(),
    /** 時間會計：最後一次計入 hands-off 嘅時刻 */
    accountedAt: time,
    /** 由停頓到第一次 CPR（nurse 開始壓胸）之間冇血流嘅秒數 */
    noFlowSec: time,
    /** CPR 開始之後暫停（rhythm check／等 order）累積嘅秒數 */
    handsOffSec: time,
    cycles: z.number().int().min(0),
    shocks: z.number().int().min(0),
    firstShockableAt: time.nullable(),
    firstShockAt: time.nullable(),
    cycle: cycleSchema,
    drugs: z.array(drugGivenSchema),
    checkedCauses: z.array(z.string()),
    treatedCauses: z.array(z.string()),
    roscAt: time.nullable(),
    roscRhythm: z.string().nullable(),
    lastRoll: rollSchema.nullable(),
    /** ROSC 之後嘅觀察窗：結束時按 post-ROSC bundle 完成度擲 re-arrest */
    postRosc: z.object({ windowEndsAt: time }).strict().nullable(),
    endedAt: time.nullable(),
  })
  .strict();

export type Resus = z.infer<typeof resusSchema>;
export type ResusCycle = z.infer<typeof cycleSchema>;
export type DrugGiven = z.infer<typeof drugGivenSchema>;
export type RoscRoll = z.infer<typeof rollSchema>;

export const deathSchema = z
  .object({
    patientId: z.string().min(1),
    diedAt: time,
    status: z.enum(['PENDING_PROCESS', 'COMPLETE']),
    /** 每步完成嘅遊戲時刻；null＝未完成 */
    steps: z
      .object({
        CERTIFICATE: time.nullable(),
        NOTIFY_SENIOR: time.nullable(),
        PHONE_FAMILY: time.nullable(),
        RECORD: time.nullable(),
      })
      .strict(),
    /** 「通知上一級」嘅對象職級（開局時由 T23 固定） */
    seniorRank: z.string().min(1),
    delayCharges: z.number().int().min(0),
    completedAt: time.nullable(),
    /** 搶救摘要（凍結於死亡一刻，供預填） */
    summary: z
      .object({
        cycles: z.number().int().min(0),
        shocks: z.number().int().min(0),
        drugs: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type Death = z.infer<typeof deathSchema>;
export { DEATH_STEP_IDS };
