import { z } from 'zod';
import { VITAL_KEYS } from './tables';

const vitalsSampleSchema = z
  .object({
    t: z.number().int().min(0),
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  })
  .strict();

const activeEffectSchema = z
  .object({
    id: z.string().min(1),
    orderId: z.string().min(1),
    startsAt: z.number().int().min(0),
    delta: z
      .object({
        hr: z.number(),
        sbp: z.number(),
        dbp: z.number(),
        spo2: z.number(),
        rr: z.number(),
        temp: z.number(),
      })
      .partial()
      .strict(),
    rampSec: z.number().int().min(1),
    durationSec: z.number().int().positive().nullable(),
  })
  .strict();

const reportSchema = z
  .object({
    id: z.string().min(1),
    orderId: z.string().min(1),
    resultId: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['PANEL', 'REPORT']),
    reportedAt: z.number().int().min(0),
    abnormal: z.boolean(),
    items: z.array(
      z
        .object({
          label: z.string(),
          valueText: z.string(),
          refText: z.string(),
          flag: z.enum(['H', 'L']).nullable(),
        })
        .strict(),
    ),
    text: z.string().nullable(),
    reviewStatus: z.enum(['PENDING_CLINICAL_REVIEW', 'REVIEWED']),
  })
  .strict();

export type PatientReport = z.infer<typeof reportSchema>;

const baseSchema = z
  .object({
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  })
  .strict();

export type VitalsSample = z.infer<typeof vitalsSampleSchema>;

/**
 * Patient（implementation-plan §4.2）：`hidden` 只 engine 讀；`visible` 先係 ViewModel 可映射嘅數據。
 * 純 JSON：可選值一律用 null。
 */
export const patientSchema = z
  .object({
    id: z.string().min(1),
    bed: z.number().int().positive(),
    demographics: z
      .object({
        name: z.string(),
        age: z.number().int(),
        sex: z.enum(['M', 'F']),
        code: z.enum(['FULL', 'DNR']),
      })
      .strict(),
    presentingComplaint: z.string(),
    allergies: z.array(z.string()),
    hidden: z
      .object({
        caseTemplateId: z.string().min(1),
        diagnosisIds: z.array(z.string()),
        fsm: z
          .object({
            state: z.string().min(1),
            enteredAt: z.number().int().min(0),
            rolled: z.array(z.number().int().min(0)),
            flags: z.array(z.string()),
          })
          .strict(),
        base: baseSchema,
        lastSampleAt: z.number().int().min(0),
        alertedBand: z.string().nullable(),
        lastAlertAt: z.number().int().min(0).nullable(),
        /** 後果（堅持下單）產生嘅生理效果；同 order 效果一齊疊加入 vitals */
        activeEffects: z.array(activeEffectSchema),
      })
      .strict(),
    visible: z
      .object({
        vitals: vitalsSampleSchema,
        /** 上次 NIBP 袖帶。畫面同口頭生命體徵都用呢對，直到玩家再量。 */
        cuff: z
          .object({
            sbp: z.number(),
            dbp: z.number(),
          })
          .strict(),
        vitalsHistory: z.array(vitalsSampleSchema),
        /** 已回報嘅化驗／檢查（T7 查表結果，唔係 AI 文字） */
        reports: z.array(reportSchema),
        rhythm: z.string().min(1),
        consciousness: z.enum(['A', 'V', 'P', 'U']),
        mews: z
          .object({
            score: z.number().int().min(0),
            band: z.string().min(1),
            components: z.record(z.string(), z.number().int()),
          })
          .strict(),
        /** 外科引流。每條都是玩家填寫的位置，可同時多條。舊存檔由 schema 12 補上空陣列。 */
        drains: z.array(
          z
            .object({
              id: z.string().min(1),
              site: z.string().min(1),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export type Patient = z.infer<typeof patientSchema>;

export const isVitalKey = (key: string): key is (typeof VITAL_KEYS)[number] =>
  (VITAL_KEYS as readonly string[]).includes(key);
