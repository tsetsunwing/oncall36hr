/**
 * Ward 狀態（M4）：位置、電話、下屬、印象、委派、計分流水。
 * `sub.level` 係隱藏資歷（B7）：只准 engine 讀，永遠唔可以進入 view 或 AI context。
 */
import { z } from 'zod';

export const RANKS = ['HO', 'MO', 'RES', 'AC', 'COS'] as const;
export type Rank = (typeof RANKS)[number];

export const CALL_TAGS = [
  'NURSE',
  'JUNIOR',
  'LAB',
  'XRAY',
  'PHARMACY',
  'DEPT',
  'OUTGOING',
  'FAMILY',
] as const;
export const CALL_PURPOSES = ['GENERAL', 'DEATH_SENIOR', 'DEATH_FAMILY', 'ARREST'] as const;
export type CallPurpose = (typeof CALL_PURPOSES)[number];
export const TONES = ['POLITE', 'NEUTRAL', 'RUDE'] as const;
export type Tone = (typeof TONES)[number];
export const PRIORITIES = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;
export const CALL_RESPONSES = ['GO_NOW', 'LATER', 'CONTINUE'] as const;
export type CallResponse = (typeof CALL_RESPONSES)[number];
export const DELEGATION_TASKS = [
  'PROCEDURE',
  'ORDER_NOTE',
  'ADMISSION',
  'SIMPLE_CALL',
  'ROUND_PREP',
] as const;
export type DelegationTaskId = (typeof DELEGATION_TASKS)[number];

const callLineSchema = z
  .object({
    t: z.number().int().min(0),
    speaker: z.enum(['CALLER', 'CALLEE', 'PLAYER']),
    name: z.string(),
    template: z.string(),
    tokenValues: z.record(z.string(), z.string()),
  })
  .strict();

export const sbarSchema = z
  .object({ S: z.string(), B: z.string(), A: z.string(), R: z.string() })
  .strict();

export type Sbar = z.infer<typeof sbarSchema>;

const vitalsRefSchema = z
  .object({
    hr: z.number(),
    sbp: z.number(),
    dbp: z.number(),
    spo2: z.number(),
    rr: z.number(),
    temp: z.number(),
  })
  .strict();

/** 會診／上報嘅雙向對話狀態：clarity 由 engine 按 SBAR 清單計，AI 只抽出玩家講咗邊啲項目 */
const consultExchangeSchema = z
  .object({
    covered: z.array(z.string()),
    clarity: z.number().int().min(0).max(3),
    inaccurate: z.boolean(),
    tone: z.enum(TONES),
    /** 對方仍然想知道嘅項目（SBAR 清單 id） */
    asks: z.array(z.string()),
    followups: z.number().int().min(0),
    ruleApplied: z.enum(['GOOD', 'POOR']).nullable(),
    vitalsRef: vitalsRefSchema,
  })
  .strict();

const familyExchangeSchema = z
  .object({
    stage: z.enum(['OPENING', 'FOLLOWUP']),
    turns: z.number().int().min(0),
    informed: z.boolean(),
    /** 已經計過分嘅規則 id，避免同一通電話重複扣／加 */
    applied: z.array(z.string()),
  })
  .strict();

export const EXCHANGE_PHASES = ['ASSESSING', 'AWAITING_REPLY', 'OPEN', 'CLOSED'] as const;

export const exchangeSchema = z
  .object({
    phase: z.enum(EXCHANGE_PHASES),
    /** 而家等緊嘅 AI 請求；結果返嚟時要同呢個 reqId 對得上先會套用 */
    reqId: z.string().nullable(),
    consult: consultExchangeSchema.nullable(),
    family: familyExchangeSchema.nullable(),
  })
  .strict();

export type Exchange = z.infer<typeof exchangeSchema>;
export type ConsultExchange = z.infer<typeof consultExchangeSchema>;
export type FamilyExchange = z.infer<typeof familyExchangeSchema>;
export type VitalsRef = z.infer<typeof vitalsRefSchema>;

const callTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RANK'), rank: z.enum(RANKS) }).strict(),
  z.object({ kind: z.literal('DEPT'), deptId: z.string().min(1) }).strict(),
]);

export type CallTarget = z.infer<typeof callTargetSchema>;

export const callSchema = z
  .object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    direction: z.enum(['IN', 'OUT']),
    tag: z.enum(CALL_TAGS),
    priority: z.enum(PRIORITIES),
    callerName: z.string(),
    callerRank: z.enum(RANKS).nullable(),
    patientId: z.string().nullable(),
    deptId: z.string().nullable(),
    target: callTargetSchema.nullable(),
    status: z.enum(['RINGING', 'DEFERRED', 'DONE', 'MISSED', 'DELEGATED']),
    resolution: z.string().nullable(),
    arrivedAt: z.number().int().min(0),
    expiresAt: z.number().int().min(0),
    ringAgainAt: z.number().int().min(0).nullable(),
    defers: z.number().int().min(0),
    delegable: z.boolean(),
    sbar: sbarSchema.nullable(),
    outcome: z.string().nullable(),
    lines: z.array(callLineSchema),
    purpose: z.enum(CALL_PURPOSES),
    exchange: exchangeSchema.nullable(),
  })
  .strict();

export type Call = z.infer<typeof callSchema>;
export type CallLine = z.infer<typeof callLineSchema>;

export const taskSchema = z
  .object({
    id: z.string().min(1),
    task: z.enum(DELEGATION_TASKS),
    itemId: z.string().min(1),
    label: z.string(),
    patientId: z.string().nullable(),
    callId: z.string().nullable(),
    orderId: z.string().nullable(),
    startsAt: z.number().int().min(0),
    completesAt: z.number().int().min(0),
    status: z.enum(['RUNNING', 'DONE', 'FAILED']),
    /** 擲骰結果：只喺 engine 內用，唔入 view（B7） */
    mode: z.enum(['OK', 'DELAYED', 'INCOMPLETE', 'WRONG']),
    failureCode: z.string().nullable(),
  })
  .strict();

export type WardTask = z.infer<typeof taskSchema>;

export const ledgerEntrySchema = z
  .object({
    t: z.number().int().min(0),
    rule: z.string().min(1),
    subscore: z.string().min(1),
    delta: z.number(),
    callId: z.string().nullable(),
    patientId: z.string().nullable(),
  })
  .strict();

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

const draftSchema = z
  .object({
    patientId: z.string().min(1),
    target: callTargetSchema,
    sbar: sbarSchema,
    createdAt: z.number().int().min(0),
    purpose: z.enum(CALL_PURPOSES),
    /** 起草嗰刻嘅生命體徵：玩家覆述舊讀數唔應該被當成講錯 */
    vitalsRef: vitalsRefSchema,
  })
  .strict();

export const wardStateSchema = z
  .object({
    enabled: z.boolean(),
    generated: z.boolean(),
    location: z
      .object({
        bed: z.number().int().positive().nullable(),
        /** 0 ＝ 護士站 */
        movingTo: z.number().int().min(0).nullable(),
        arriveAt: z.number().int().min(0).nullable(),
      })
      .strict(),
    sub: z
      .object({
        id: z.string().min(1),
        rank: z.enum(['HO', 'MO']),
        name: z.string(),
        level: z.enum(['NOVICE', 'NORMAL', 'SENIOR']),
        busyUntil: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    impressions: z.record(z.string(), z.number()),
    calls: z.array(callSchema),
    contacts: z.record(z.string(), z.array(z.enum(RANKS))),
    draft: draftSchema.nullable(),
    tasks: z.array(taskSchema),
    ledger: z.array(ledgerEntrySchema),
    tags: z.record(z.string(), z.array(z.string())),
    plannedCalls: z.number().int().min(0),
    counters: z.object({ call: z.number().int().min(0), task: z.number().int().min(0) }).strict(),
  })
  .strict();

export type WardState = z.infer<typeof wardStateSchema>;

export const emptyWard = (): WardState => ({
  enabled: false,
  generated: false,
  location: { bed: null, movingTo: null, arriveAt: null },
  sub: null,
  impressions: {},
  calls: [],
  contacts: {},
  draft: null,
  tasks: [],
  ledger: [],
  tags: {},
  plannedCalls: 0,
  counters: { call: 0, task: 0 },
});
