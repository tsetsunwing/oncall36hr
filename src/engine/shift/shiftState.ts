/**
 * 更次狀態（M6，schema v6）：巡房、精力與自我照顧、超時、交更同結局。
 * 全部係 engine 擁有嘅事實；AI 只負責巡房題目／評分嘅用字，唔讀亦唔寫呢啲欄位。
 */
import { z } from 'zod';

const time = z.number().int().min(0);

export const ROUND_PHASES = ['LOADING', 'ASKING', 'GRADING', 'REVEAL'] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];
export const ROUND_VERDICTS = ['CORRECT', 'PARTIAL', 'WRONG', 'UNANSWERED'] as const;
export type RoundVerdict = (typeof ROUND_VERDICTS)[number];

const roundResultSchema = z
  .object({
    patientId: z.string().min(1),
    topicId: z.string().min(1),
    verdict: z.enum(ROUND_VERDICTS),
    viaHint: z.boolean(),
  })
  .strict();

export type RoundResult = z.infer<typeof roundResultSchema>;

const roundCurrentSchema = z
  .object({
    patientId: z.string().min(1),
    topicId: z.string().min(1),
    phase: z.enum(ROUND_PHASES),
    requestId: z.string().nullable(),
    question: z.string().nullable(),
    hints: z.array(z.string()),
    askedAt: time.nullable(),
    answer: z.string().nullable(),
    viaHint: z.boolean(),
    verdict: z.enum(ROUND_VERDICTS).nullable(),
    matchedKeyFacts: z.array(z.string()),
    seniorLine: z.string().nullable(),
  })
  .strict();

export type RoundCurrent = z.infer<typeof roundCurrentSchema>;

const roundActiveSchema = z
  .object({
    /** 第幾次巡房（由 1 起） */
    number: z.number().int().min(1),
    startedAt: time,
    queue: z.array(z.string().min(1)),
    cursor: z.number().int().min(0),
    results: z.array(roundResultSchema),
    current: roundCurrentSchema.nullable(),
  })
  .strict();

export type RoundActive = z.infer<typeof roundActiveSchema>;

const roundRecordSchema = z
  .object({
    number: z.number().int().min(1),
    startedAt: time,
    endedAt: time,
    results: z.array(roundResultSchema),
  })
  .strict();

export const SELF_CARE_ID_LIST = ['MEAL', 'NAP', 'TOILET', 'WATER', 'PHONE_CHAT', 'MUSIC'] as const;

const selfCareActiveSchema = z
  .object({
    actionId: z.enum(SELF_CARE_ID_LIST),
    startedAt: time,
    endsAt: time,
  })
  .strict();

export const ENDING_REASONS = ['NORMAL', 'OVERTIME', 'FAINT'] as const;
export type EndingReasonId = (typeof ENDING_REASONS)[number];

const endingSchema = z
  .object({
    reason: z.enum(ENDING_REASONS),
    /** 強制結局標籤：暈倒只得 FAINT，超時只得 OVERTIME，兩者互相獨立 */
    tags: z.array(z.enum(['OVERTIME', 'FAINT'])),
    at: time,
    forced: z.boolean(),
    selected: z.array(z.string()),
    overtimeSeconds: time,
  })
  .strict();

export type Ending = z.infer<typeof endingSchema>;

export const shiftSchema = z
  .object({
    rounds: z
      .object({
        started: z.number().int().min(0),
        completed: z.number().int().min(0),
        /** 到咗巡房時間，等玩家自己打開；未打開就唔進入巡房 */
        offeredAt: time.nullable(),
        active: roundActiveSchema.nullable(),
        history: z.array(roundRecordSchema),
      })
      .strict(),
    /** 已食過嘅用餐節點 index（同 timeline mealNodes 對應） */
    mealsTaken: z.array(z.number().int().min(0)),
    energy: z
      .object({
        /** 餘量：100 − max(疲倦, 飢餓)。歸零即暈倒。內急唔計入。 */
        percent: z.number().min(0).max(100),
        /** 愈高愈差。休息室降低。 */
        fatigue: z.number().min(0).max(100),
        /** 愈高愈差。茶水間降低。開場 30%。 */
        hunger: z.number().min(0).max(100),
        /** 愈高愈差。洗手間降低。開場 20%。到 100% 失禁跳 1 小時，唔暈倒。 */
        bladder: z.number().min(0).max(100),
        lastNudgeAt: time.nullable(),
        place: z.enum(['STATION', 'PANTRY', 'REST', 'WC']).nullable(),
        placeAt: z
          .object({
            PANTRY: time.nullable(),
            REST: time.nullable(),
            WC: time.nullable(),
          })
          .strict(),
      })
      .strict(),
    selfCare: z
      .object({
        active: selfCareActiveSchema.nullable(),
        lastEndedAt: z.record(z.string(), time),
      })
      .strict(),
    overtime: z
      .object({
        enteredAt: time.nullable(),
        workInFlight: z.boolean(),
      })
      .strict(),
    handover: z.object({ selected: z.array(z.string()) }).strict(),
    ending: endingSchema.nullable(),
  })
  .strict();

export type ShiftState = z.infer<typeof shiftSchema>;

export const emptyShift = (): ShiftState => ({
  rounds: { started: 0, completed: 0, offeredAt: null, active: null, history: [] },
  mealsTaken: [],
  energy: {
    percent: 100,
    fatigue: 0,
    hunger: 0,
    bladder: 0,
    lastNudgeAt: null,
    place: null,
    placeAt: { PANTRY: null, REST: null, WC: null },
  },
  selfCare: { active: null, lastEndedAt: {} },
  overtime: { enteredAt: null, workInFlight: false },
  handover: { selected: [] },
  ending: null,
});
