/**
 * M2 收緊嘅內容表 schema（implementation-plan §5：T1、T2、T3、T4、T5、T6、T8、T10、T14、T26）。
 * 其餘表仍然係「陣列＋唯一 id」，於對應 milestone 逐張收緊。
 */
import { z } from 'zod';

export const VITAL_KEYS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'temp'] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

export const id = z.string().min(1);
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
export const partialVitalDelta = z
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
    states: z.record(
      id,
      z
        .object({
          trajectory: id,
          /** M5：進入呢個狀態即心臟停頓，初始節律由呢度指定（必須係無脈搏 rhythm） */
          arrest: z.object({ rhythm: id }).strict().optional(),
        })
        .strict(),
    ),
    postRoscState: id.optional(),
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
    /** 病人組生成用：簡單／複雜個案（T12 比例、T13 職級複雜度）；冇寫＝複雜 */
    /** SCENARIO：劇本式個案（例如心臟停頓），唔會被隨機病房生成揀中 */
    complexity: z.enum(['SIMPLE', 'COMPLEX', 'SCENARIO']).default('COMPLEX'),
    allergies: z.array(id),
    diagnosisIds: z.array(id).min(1),
    /** 護士／病人對白唔可以講出嘅診斷詞（B6、numeric guard deny-list）；只留喺本機，唔送去 AI */
    diagnosisTerms: z.array(z.string().min(1)).min(1),
    /** 病人可以講嘅症狀（書面語提示，由 AI 譯成口語）；按 FSM 狀態 */
    symptomsByState: z.record(id, z.array(z.string().min(1))),
    /** M5：心臟停頓時真正存在嘅可逆病因（H's and T's，T1）；對應 `reversible-causes` 表 id */
    reversibleCauseIds: z.array(id).default([]),
    /** M5：死亡證明預填嘅死因文字（虛構病例內容；死亡後先顯示） */
    deathCause: z.string().min(1).default('心臟停頓（死因待確認）'),
  })
  .strict();

/** spec §11 全部 order 類型（X-ray／CT／ultrasound 各自一類；監測醫囑為 M3 加入） */
export const ORDER_TYPES = [
  'OBSERVATION',
  'MONITORING',
  'OXYGEN',
  'FLUID',
  'DRUG',
  'LAB_BLOOD',
  'ECG',
  'XRAY',
  'CT',
  'ULTRASOUND',
  'ABG',
  'BLOOD_CULTURE',
  'CROSSMATCH',
  'PROCEDURE',
  'RESUSCITATION',
] as const;

export const EXECUTOR_KINDS = ['NURSE', 'SUBORDINATE', 'PLAYER'] as const;
export const REVIEW_STATUSES = ['PENDING_CLINICAL_REVIEW', 'REVIEWED'] as const;
export const SUNK_EFFECT_RULES = ['DISCARD', 'KEEP_PARTIAL'] as const;

/**
 * T4 order-catalog。
 * `fixedDurationSec`：執行完成（例如抽血完成、膠片拍攝完成）所需時間；化驗／影像報告延遲屬 T7（`resultId`）。
 * 把關：`pharmacyGate` 藥房永遠把關；`nurseGate` 只喺護士可提醒（非新入職）時先會發出請求。
 * `sunkEffectRule`：取消時已投入部分嘅處理（DISCARD＝效果全部撤回；KEEP_PARTIAL＝按已完成比例保留）。
 */
export const ACLS_ACTIONS = ['CPR_START', 'RHYTHM_CHECK', 'DEFIB', 'DRUG', 'TERMINATE'] as const;
export type AclsAction = (typeof ACLS_ACTIONS)[number];

export const orderCatalogEntrySchema = z
  .object({
    id,
    type: z.enum(ORDER_TYPES),
    label: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    executors: z.array(z.enum(EXECUTOR_KINDS)).min(1),
    fixedDurationSec: z.number().int().min(0),
    setsFlags: z.array(id),
    formularyId: id.optional(),
    resultId: id.optional(),
    resultTemplate: z.string().min(1).optional(),
    cancelWhile: z.array(z.enum(['QUEUED', 'RUNNING'])),
    sunkEffectRule: z.enum(SUNK_EFFECT_RULES),
    pharmacyGate: z.boolean(),
    nurseGate: z.enum(['ALWAYS', 'HIGH_RISK', 'NEVER']),
    /** M5：搶救動作標記（由 engine acls 模組處理）；急救藥物同搶救 order 不經藥房／護士把關 */
    acls: z
      .object({ action: z.enum(ACLS_ACTIONS) })
      .strict()
      .optional(),
    reviewStatus: z.enum(REVIEW_STATUSES),
  })
  .strict();

/**
 * T5 formulary：parse 對照同顯示一致。把關判斷仍然係 AI（Q80 C），所以呢度冇規則；
 * `typicalDose` 於臨床審核前一律 null（唔臆測劑量範圍），AI 按自身藥理知識判斷。
 */
export const formularyEntrySchema = z
  .object({
    id,
    label: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    catalogId: id,
    units: z.array(z.string().min(1)).min(1),
    routes: z.array(z.string().min(1)).min(1),
    drugClass: z.string().min(1),
    allergyClasses: z.array(id),
    typicalDose: z
      .object({ min: z.number().positive(), max: z.number().positive(), unit: z.string().min(1) })
      .strict()
      .nullable(),
    reviewStatus: z.enum(REVIEW_STATUSES),
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
    reviewStatus: z.enum(REVIEW_STATUSES),
  })
  .strict();

const waveComponentSchema = z
  .object({ offsetSec: z.number(), widthSec: z.number().positive(), amplitude: z.number() })
  .strict();

const plethSchema = z
  .object({
    delaySec: z.number().min(0),
    riseSec: z.number().positive(),
    fallSec: z.number().positive(),
    notchSec: z.number().positive(),
    notchAmplitude: z.number().min(0).max(1),
  })
  .strict();

/**
 * 波形參數（純表現層，唔入 state）：
 * `sinus`＝逐拍重複嘅複合波（P／QRS／T 以 R 波頂點為 0），可加不規則週期同基線振盪（AF、flutter、傳導阻滯）；
 * `fibrillation`＝連續正弦疊加（VF、torsades）；`flat`＝近乎直線（asystole）。
 * `pleth` 為 null＝冇脈搏波（無脈搏節律）。
 */
const waveSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('sinus'),
      ecg: z.array(waveComponentSchema).min(1),
      pleth: plethSchema.nullable(),
      periodJitter: z.number().min(0).max(0.5).optional(),
      baseline: z
        .object({ freqHz: z.number().positive(), amplitude: z.number().min(0) })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('fibrillation'),
      components: z
        .array(z.object({ freqHz: z.number().positive(), amplitude: z.number().min(0) }).strict())
        .min(1),
      envelopeHz: z.number().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('flat'),
      driftAmplitude: z.number().min(0),
      driftFreqHz: z.number().positive(),
    })
    .strict(),
]);

export const RHYTHM_ALARMS = ['NONE', 'CAUTION', 'ALARM'] as const;

/**
 * T8 rhythms（M5：全部 rhythm）。`family` 相同嘅 rhythm 會按 HR 範圍自動揀；
 * `pulse`＝false 嘅節律（VF、pVT、torsades、PEA、asystole）係心臟停頓節律；
 * `electricalRate`：無脈搏節律嘅示意電活動速率（只用於畫波形，唔係 HR 讀數）；
 * `alarm`：監測儀靜態警示等級（顏色＋文字，唔閃爍）。
 */
export const rhythmSchema = z
  .object({
    id,
    label: z.string().min(1),
    family: id,
    hrRange: z.tuple([z.number(), z.number()]),
    shockable: z.boolean(),
    pulse: z.boolean(),
    alarm: z.enum(RHYTHM_ALARMS),
    electricalRate: z.number().min(0),
    wave: waveSchema,
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.shockable && row.pulse) {
      ctx.addIssue({ code: 'custom', message: 'shockable 節律必須係無脈搏節律（pulse=false）' });
    }
    if (!row.pulse && row.wave.kind === 'sinus' && row.wave.pleth !== null) {
      ctx.addIssue({ code: 'custom', message: '無脈搏節律唔可以有 pleth 波形' });
    }
    if (row.pulse && row.wave.kind !== 'sinus') {
      ctx.addIssue({ code: 'custom', message: '有脈搏節律必須用 sinus 類波形' });
    }
  });

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
        executor: z.enum(EXECUTOR_KINDS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
