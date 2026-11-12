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

/** 瞳孔：直徑（mm）同對光反應。唔上心臟監察儀。 */
const pupilSchema = z
  .object({
    sizeMm: z.number().min(1).max(9),
    reaction: z.enum(['BRISK', 'SLUGGISH', 'FIXED']),
  })
  .strict();

/** GCS 用 E/V/M 三個分項，同 ACVPU 並存：ACVPU 係護士口頭用，GCS 係評分用。 */
const neuroSchema = z
  .object({
    gcs: z
      .object({
        e: z.number().int().min(1).max(4),
        v: z.number().int().min(1).max(5),
        m: z.number().int().min(1).max(6),
      })
      .strict(),
    pupils: z.object({ left: pupilSchema, right: pupilSchema }).strict(),
  })
  .strict();

export type Pupil = z.infer<typeof pupilSchema>;
export type Neuro = z.infer<typeof neuroSchema>;

/** ACVPU 對應的 GCS 起點。之後由病程改，唔會自動跟 ACVPU 走。 */
export function gcsForConsciousness(consciousness: 'A' | 'V' | 'P' | 'U'): Neuro['gcs'] {
  switch (consciousness) {
    case 'A':
      return { e: 4, v: 5, m: 6 };
    case 'V':
      return { e: 3, v: 4, m: 5 };
    case 'P':
      return { e: 2, v: 2, m: 4 };
    case 'U':
      return { e: 1, v: 1, m: 1 };
  }
}

/** 正常瞳孔：3 mm，對光反應靈敏。 */
export const NORMAL_PUPILS: Neuro['pupils'] = {
  left: { sizeMm: 3, reaction: 'BRISK' },
  right: { sizeMm: 3, reaction: 'BRISK' },
};

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
    pastMedicalHistory: z.array(z.string().min(1)).optional(),
    knownDiagnoses: z.array(z.string().min(1)).optional(),
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
        /** 介入／治療對化驗值嘅修飾；未斷病因嘅會隨時間回跌 */
        labModifiers: z.array(
          z
            .object({
              analyte: z.string().min(1),
              delta: z.number(),
              appliedAt: z.number().int().min(0),
              decayPerHour: z.number().min(0),
              decayUnless: z.string().min(1).nullable(),
              capLow: z.number().nullable(),
              capHigh: z.number().nullable(),
            })
            .strict(),
        ),
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
        /**
         * 病人身上儲存嘅化驗值。建立病人時由診斷或正常基準算好，
         * 重複檢查只加睇不出走勢嘅小變動；只有治療才會真正改動。
         */
        labs: z.record(
          z.string().min(1),
          z.object({ value: z.number(), at: z.number().int().min(0) }).strict(),
        ),
        rhythm: z.string().min(1),
        consciousness: z.enum(['A', 'V', 'P', 'U']),
        /** 疼痛分數 0–10；未問過病人＝null。唔上心臟監察儀。 */
        pain: z.number().int().min(0).max(10).nullable(),
        /** 煩躁 0–3；未評估＝null。 */
        agitation: z.number().int().min(0).max(3).nullable(),
        /** 噁心 0–3；未評估＝null。 */
        nausea: z.number().int().min(0).max(3).nullable(),
        /** GCS（E/V/M）同瞳孔。唔上心臟監察儀。 */
        neuro: neuroSchema,
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
