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
      })
      .strict(),
    visible: z
      .object({
        vitals: vitalsSampleSchema,
        vitalsHistory: z.array(vitalsSampleSchema),
        rhythm: z.string().min(1),
        consciousness: z.enum(['A', 'V', 'P', 'U']),
        mews: z
          .object({
            score: z.number().int().min(0),
            band: z.string().min(1),
            components: z.record(z.string(), z.number().int()),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type Patient = z.infer<typeof patientSchema>;

export const isVitalKey = (key: string): key is (typeof VITAL_KEYS)[number] =>
  (VITAL_KEYS as readonly string[]).includes(key);
