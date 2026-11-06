/**
 * M2 收緊嘅內容表 schema（implementation-plan §5：T1、T2、T3、T4、T5、T6、T8、T10、T14、T26）。
 * 其餘表仍然係「陣列＋唯一 id」，於對應 milestone 逐張收緊。
 */
import { z } from 'zod';

export const VITAL_KEYS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'temp'] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

const id = z.string().min(1);
const vitalNumbers = z
  .object({
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  })
  .strict();
const nonNegativeVitals = z
  .object({
    hr: z.number().nonnegative(),
    sbp: z.number().nonnegative(),
    dbp: z.number().nonnegative(),
    spo2: z.number().nonnegative(),
    rr: z.number().nonnegative(),
    temp: z.number().nonnegative(),
  })
  .strict();
const positiveVitals = z
  .object({
    hr: z.number().positive(),
    sbp: z.number().positive(),
    dbp: z.number().positive(),
    spo2: z.number().positive(),
    rr: z.number().positive(),
    temp: z.number().positive(),
  })
  .strict();
const partialVitalDelta = z
  .object({
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  })
  .partial()
  .strict();

export const CONSCIOUSNESS_LEVELS = ['A', 'V', 'P', 'U'] as const;

/** T3 trajectories：每個 case 狀態嘅 vitals 目標、斜率（每遊戲分鐘）、噪音、rhythm、意識 */
export const trajectorySchema = z
  .object({
    id,
    target: vitalNumbers,
    slopePerMin: positiveVitals,
    noise: nonNegativeVitals,
    rhythm: id,
    consciousness: z.enum(CONSCIOUSNESS_LEVELS),
  })
  .strict();

const transitionWhenSchema = z
  .object({
    timeInStateSec: z.number().int().min(0).optional(),
    timeAtLeastSec: z.number().int().min(0).optional(),
    flagsAll: z.array(id).optional(),
    flagsNone: z.array(id).optional(),
    missingAny: z.array(id).optional(),
  })
  .strict();

/** T2 case-fsm：狀態、轉移（時間／flag／機率）。`p` 命中以 rng.events 擲骰，每次進入狀態每條轉移只擲一次 */
export const caseFsmSchema = z
  .object({
    id,
    initial: id,
    states: z.record(id, z.object({ trajectory: id }).strict()),
    transitions: z.array(
      z
        .object({
          from: id,
          to: id,
          when: transitionWhenSchema,
          p: z.number().min(0).max(1),
        })
        .strict(),
    ),
    salvageable: z.boolean(),
  })
  .strict();

/** T1 case-templates */
export const caseTemplateSchema = z
  .object({
    id,
    fsmId: id,
    bed: z.number().int().positive(),
    demographics: z
      .object({
        name: z.string().min(1),
        age: z.number().int().positive(),
        sex: z.enum(['M', 'F']),
        code: z.enum(['FULL', 'DNR']),
      })
      .strict(),
    presentingComplaint: z.string().min(1),
    allergies: z.array(id),
    diagnosisIds: z.array(id).min(1),
    /** 護士／病人對白唔可以講出嘅診斷詞（B6、numeric guard deny-list）；只留喺本機，唔送去 AI */
    diagnosisTerms: z.array(z.string().min(1)).min(1),
    /** 病人可以講嘅症狀（書面語提示，由 AI 譯成口語）；按 FSM 狀態 */
    symptomsByState: z.record(id, z.array(z.string().min(1))),
  })
  .strict();

export const ORDER_TYPES = ['OBSERVATION', 'OXYGEN', 'FLUID', 'DRUG'] as const;

/** T4 order-catalog（M2 只有 4 類；其餘類型屬 M3） */
export const orderCatalogEntrySchema = z
  .object({
    id,
    type: z.enum(ORDER_TYPES),
    label: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    executors: z.array(z.enum(['NURSE'])).min(1),
    fixedDurationSec: z.number().int().min(0),
    setsFlags: z.array(id),
    formularyId: id.optional(),
    resultTemplate: z.string().min(1).optional(),
    cancelWhile: z.array(z.enum(['QUEUED', 'RUNNING'])),
  })
  .strict();

/** T5 formulary（M2：只作本地 parse 對照；把關屬 M3） */
export const formularyEntrySchema = z
  .object({
    id,
    label: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    catalogId: id,
    units: z.array(z.string().min(1)).min(1),
    routes: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** T6 order-effects：(order × case 狀態) → vitals delta、起效延遲、漸進時間、持續時間（null＝持續） */
export const orderEffectSchema = z
  .object({
    id,
    catalogId: id,
    states: z.array(z.string().min(1)).min(1),
    delta: partialVitalDelta,
    delaySec: z.number().int().min(0),
    rampSec: z.number().int().min(1),
    durationSec: z.number().int().positive().nullable(),
  })
  .strict();

const waveComponentSchema = z
  .object({ offsetSec: z.number(), widthSec: z.number().positive(), amplitude: z.number() })
  .strict();

/** T8 rhythms（M2：只有竇性節律；全部 rhythm 屬 M5）。`family` 相同嘅 rhythm 會按 HR 範圍自動揀 */
export const rhythmSchema = z
  .object({
    id,
    label: z.string().min(1),
    family: id,
    hrRange: z.tuple([z.number(), z.number()]),
    shockable: z.boolean(),
    pulse: z.boolean(),
    wave: z
      .object({
        kind: z.literal('sinus'),
        /** 以 R 波頂點為 0 嘅時間偏移（秒）；P、T 波於高心率時按週期壓縮 */
        ecg: z.array(waveComponentSchema).min(1),
        pleth: z
          .object({
            delaySec: z.number().min(0),
            riseSec: z.number().positive(),
            fallSec: z.number().positive(),
            notchSec: z.number().positive(),
            notchAmplitude: z.number().min(0).max(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const mewsRangeSchema = z
  .object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    score: z.number().int().min(0),
    direction: z.enum(['LOW', 'HIGH']).nullable(),
  })
  .strict();

/** T10 mews：engine 只讀此表，唔內置任何分段。區間係 [min, max)；null ＝ 無下限／上限 */
export const mewsSchema = z
  .object({
    id,
    reviewStatus: z.enum(['PENDING_CLINICAL_REVIEW', 'REVIEWED']),
    note: z.string(),
    components: z
      .object({
        rr: z.array(mewsRangeSchema).min(1),
        hr: z.array(mewsRangeSchema).min(1),
        sbp: z.array(mewsRangeSchema).min(1),
        temp: z.array(mewsRangeSchema).min(1),
        spo2: z.array(mewsRangeSchema).min(1),
      })
      .strict(),
    avpu: z
      .object({
        A: z.number().int(),
        V: z.number().int(),
        P: z.number().int(),
        U: z.number().int(),
      })
      .strict(),
    /** 單項分數達到呢個值，監測器就顯示對應等級嘅警示標籤 */
    componentAlert: z
      .object({ cautionMin: z.number().int().min(1), alarmMin: z.number().int().min(1) })
      .strict(),
    bands: z
      .array(
        z
          .object({
            id,
            min: z.number().int().min(0),
            max: z.number().int().min(0).nullable(),
            alert: z.enum(['NONE', 'CAUTION', 'ALARM']),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** T14 nurse-roster（M2 只用名、班次、性格；分區、資歷屬 M4） */
export const nurseRosterEntrySchema = z
  .object({
    id,
    name: z.string().min(1),
    shift: z.enum(['DAY', 'NIGHT']),
    zone: id,
    tone: z.string().min(1),
  })
  .strict();

/** T26 quick-words：快捷詞字典 → 本地 parse 成 action（唔經 AI） */
export const quickWordSchema = z
  .object({
    id,
    aliases: z.array(z.string().min(1)).min(1),
    catalogId: id,
    chipLabel: z.string().min(1).optional(),
    params: z
      .object({
        drugFormularyId: id.optional(),
        dose: z
          .object({ value: z.number().positive(), unit: z.string().min(1) })
          .strict()
          .optional(),
        route: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
