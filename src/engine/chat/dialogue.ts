/**
 * 對白管線（implementation-plan §2.4、§7.2 dialogue.turn）：
 * engine 先決定「發生咗咩」（beats）同凍結 token 值，AI 只負責措辭。
 * Token 於 queue 嗰刻凍結並寫入 pending context，所以 AI 慢返嚟、或者存檔重試，對白數值都唔會變。
 */
import { z } from 'zod';
import { meanArterialPressure } from '../case/mews';
import type { Patient } from '../case/patient';
import {
  MEWS_COMPONENT_KEYS,
  type EngineTables,
  type ExecutorKind,
  type MewsComponentKey,
} from '../case/tables';
import { rejectAiResult, requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import type { ChatLine, ChatThread } from './chatTypes';
import { shortReplyTemplate } from './shortReplies';
import { extractTokens, leaksDiagnosis, validateTemplate } from './tokens';

export const DIALOGUE_KIND = 'dialogue.turn';

// JSON 相容（有隱含 index signature）先可以放入 AI context，所以用 type 而唔係 interface
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Abnormal = {
  key: MewsComponentKey;
  direction: 'LOW' | 'HIGH';
};

export const PHARMACY_SPEAKER_ID = 'dept:pharmacy';

export type Beat =
  | { type: 'ACK_ORDER'; speaker: 'NURSE'; labelToken: string; executor: ExecutorKind | null }
  | { type: 'GATE_RECONFIRM'; speaker: 'NURSE' | 'PHARMACY'; labelToken: string }
  | { type: 'REPORT_LAB_READY'; speaker: 'NURSE'; labelToken: string; abnormal: boolean }
  | { type: 'ORDER_CANCELLED'; speaker: 'NURSE'; labelToken: string }
  | {
      type: 'REPORT_RESULT';
      speaker: 'NURSE';
      labelToken: string;
      tokens: string[];
      abnormal: Abnormal[];
      /** 目錄已經寫好嘅結果句。有呢句就本地講，唔再叫模型認 order。 */
      preset?: string;
    }
  | { type: 'REPORT_STATUS'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | {
      type: 'ANSWER_QUESTION';
      speaker: 'NURSE';
      question: string;
      tokens: string[];
      abnormal: Abnormal[];
    }
  | { type: 'ALERT_DETERIORATION'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | { type: 'PATIENT_SPEAKS'; speaker: 'PATIENT'; symptoms: string[] }
  | { type: 'ACK_CHAT'; speaker: 'NURSE' }
  | { type: 'ASK_REPHRASE'; speaker: 'NURSE'; reason: 'UNKNOWN_ORDER' | 'UNSUPPORTED' }
  | { type: 'ARREST_ANNOUNCED'; speaker: 'NURSE'; tokens: string[]; rearrest: boolean }
  | { type: 'ACLS_CYCLE_DUE'; speaker: 'NURSE'; tokens: string[] }
  | {
      type: 'ACLS_ACTION_DONE';
      speaker: 'NURSE';
      action: AclsActionDone;
      labelToken: string | null;
    }
  | { type: 'ACLS_RHYTHM_REPORTED'; speaker: 'NURSE'; tokens: string[]; shockable: boolean }
  | { type: 'ACLS_ROSC'; speaker: 'NURSE' }
  | { type: 'ACLS_STOP_REFUSED'; speaker: 'NURSE'; tokens: string[] }
  | { type: 'ACLS_NOT_APPLICABLE'; speaker: 'NURSE'; labelToken: string }
  | { type: 'ACLS_SHOCK_REFUSED'; speaker: 'NURSE'; labelToken: string; tokens: string[] }
  | { type: 'DEATH_PRONOUNCED'; speaker: 'NURSE'; tokens: string[] };

export const ACLS_ACTIONS_DONE = [
  'CPR_STARTED',
  'CPR_RESUMED',
  'CPR_ALREADY_RUNNING',
  'SHOCK_DELIVERED',
  'DRUG_GIVEN',
] as const;
export type AclsActionDone = (typeof ACLS_ACTIONS_DONE)[number];

export const VITAL_TOKEN_KEYS = [
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.map',
  'vital.spo2',
  'vital.rr',
  'vital.temp',
  'mews.score',
  'rhythm.label',
] as const;

export function vitalTokens(patient: Patient, tables: EngineTables): Record<string, string> {
  const v = patient.visible.vitals;
  const cuff = patient.visible.cuff;
  const rhythm = tables.rhythms.find((r) => r.id === patient.visible.rhythm);
  return {
    'vital.hr': String(v.hr),
    'vital.sbp': String(cuff.sbp),
    'vital.dbp': String(cuff.dbp),
    'vital.map': String(meanArterialPressure(cuff.sbp, cuff.dbp)),
    'vital.spo2': String(v.spo2),
    'vital.rr': String(v.rr),
    'vital.temp': v.temp.toFixed(1),
    'mews.score': String(patient.visible.mews.score),
    'rhythm.label': rhythm?.label ?? patient.visible.rhythm,
  };
}

export function patientTokens(patient: Patient): Record<string, string> {
  return { 'patient.name': patient.demographics.name, 'patient.bed': String(patient.bed) };
}

/** 邊啲項目偏離正常：方向來自 MEWS 表（唔係 AI、唔係 view 自己估） */
export function abnormalOf(patient: Patient, tables: EngineTables): Abnormal[] {
  const mews = tables.mews[0];
  if (!mews) return [];
  const out: Abnormal[] = [];
  for (const key of MEWS_COMPONENT_KEYS) {
    const score = patient.visible.mews.components[key] ?? 0;
    if (score <= 0) continue;
    const v = patient.visible.vitals[key];
    const range = mews.components[key].find(
      (r) => (r.min === null || v >= r.min) && (r.max === null || v < r.max),
    );
    if (range?.direction) out.push({ key, direction: range.direction });
  }
  return out;
}

export interface DialogueTurnInput {
  patientId: string;
  beats: Beat[];
  /** 發言當刻凍結嘅 token 值；key 即係 AI 可以用嘅 allowedTokens */
  tokens: Record<string, string>;
  addressed: string[];
  /** 已經落定嘅一張 order。提醒呼叫只帶呢張，唔帶目錄。 */
  resolvedOrder?: { catalogId: string; label: string };
}

interface SpeakerLike {
  id: string;
  kind: ChatLine['speaker']['kind'];
  name: string;
  tone: string | null;
}

function speakerView(present: SpeakerLike) {
  return { id: present.id, kind: present.kind, name: present.name, tone: present.tone };
}

/** 藥房唔喺床邊，只經電話出現（spec §15）：獨立 speaker，唔入 thread.present */
export function pharmacySpeaker(ctx: EngineContext): SpeakerLike {
  return {
    id: PHARMACY_SPEAKER_ID,
    kind: 'PHARMACY',
    name: ctx.config.gate.pharmacyName,
    tone: null,
  };
}

/** 呢啲 beat 講嘅係「而家」嘅狀態：數值喺發言（寫入對話）當刻取，唔係排隊當刻 */
const LIVE_BEATS: readonly Beat['type'][] = [
  'REPORT_STATUS',
  'ANSWER_QUESTION',
  'ALERT_DETERIORATION',
];

function liveTokensOf(beats: readonly Beat[]): string[] {
  const live = new Set<string>();
  const frozen = new Set<string>();
  for (const beat of beats) {
    const tokens = 'tokens' in beat ? beat.tokens : [];
    for (const token of tokens) (LIVE_BEATS.includes(beat.type) ? live : frozen).add(token);
    if ('labelToken' in beat && beat.labelToken !== null) frozen.add(beat.labelToken);
  }
  return [...live].filter((token) => !frozen.has(token));
}

/**
 * 收到、已執行、量完生命體徵、聽唔清楚：有系統模板嘅 beat 本地寫入，唔再叫模型。
 * 其餘 beat 原樣交返模型，所以同一批入面兩種都有時，模板句照寫、其餘照問模型，唔會漏句。
 * 模板填唔到 token 時留空，唔交俾模型補數字。
 */
function scriptedNurseTurn(
  state: GameState,
  thread: ChatThread,
  input: DialogueTurnInput,
  ctx: EngineContext,
): { state: GameState; rest: Beat[] } {
  const nurse = thread.present.find((person) => person.kind === 'NURSE');
  let next = state;
  const rest: Beat[] = [];
  for (const beat of input.beats) {
    const template = shortReplyTemplate(beat);
    if (template === null) {
      rest.push(beat);
      continue;
    }
    if (!nurse) continue;
    const needed = extractTokens(template);
    const limit = beat.type === 'ALERT_DETERIORATION' ? 220 : ctx.config.chat.maxLineChars;
    const catalogSentence =
      beat.type === 'REPORT_RESULT' && beat.preset !== undefined && template === beat.preset;
    if (!catalogSentence && validateTemplate(template, new Set(needed), limit) !== null) {
      continue;
    }
    const tokenValues: Record<string, string> = {};
    let complete = true;
    for (const token of needed) {
      const value = input.tokens[token];
      if (value === undefined) complete = false;
      else tokenValues[token] = value;
    }
    if (!complete) continue;
    next = appendLine(next, {
      t: next.clock.t,
      patientId: input.patientId,
      speaker: { kind: 'NURSE', id: nurse.id },
      template,
      tokenValues,
      orderId: null,
    });
  }
  return { state: next, rest };
}

const CARD_ORDERS = 6;
const CARD_FLAGS = 8;
/** 床邊而家進行緊嘅治療。唔包括隱藏狀態（未接來電、巡房、FSM）。 */
const VISIBLE_FLAGS = new Set([
  'monitoring.vitals',
  'monitoring.spo2',
  'monitoring.io',
  'oxygen.on',
  'fluid.bolus',
  'abx.iv',
  'ngt.in',
  'foley.in',
  'chesttube.in',
  'cvc.in',
  'aline.in',
  'airway.secured',
  'decompression.done',
  'pericardiocentesis.done',
  'rewarm.on',
]);

/**
 * 每次對白呼叫只帶固定大小嘅病人卡，加最近幾句。
 * 完整對話留喺病人紀錄，唔會隨更次變長而再送去模型。
 */
function patientCard(state: GameState, patientId: string) {
  const openOrders = Object.values(state.orders)
    .filter(
      (order) =>
        order.patientId === patientId &&
        (order.status === 'QUEUED' || order.status === 'GATED' || order.status === 'RUNNING'),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-CARD_ORDERS)
    .map((order) => ({ id: order.id, catalogId: order.catalogId }));
  const flags = state.patients[patientId]?.hidden.fsm.flags ?? [];
  const active = flags
    .filter((flag) => VISIBLE_FLAGS.has(flag))
    .sort()
    .slice(0, CARD_FLAGS);
  return { openOrders, active };
}

function recentLines(thread: ChatThread, limit: number) {
  return thread.lines
    .filter((line) => line.speaker.kind !== 'SYSTEM')
    .slice(-limit)
    .map((line) => ({
      speaker: line.speaker.id,
      kind: line.speaker.kind,
      template: line.template,
    }));
}

/**
 * Context 分兩部分：`prompt` 會送去 AI；`local` 只留喺本機（deny-list、凍結 token 值）。
 * B6：prompt 內唔會出現隱藏診斷、FSM 狀態或下屬／護士資歷。
 */
export function queueDialogue(
  state: GameState,
  input: DialogueTurnInput,
  ctx: EngineContext,
): { state: GameState; effect: Effect | null } | undefined {
  const patient = state.patients[input.patientId];
  const thread = state.chats[input.patientId];
  if (!patient || !thread) return undefined;
  const scripted =
    input.beats.length === 0
      ? { state, rest: input.beats }
      : scriptedNurseTurn(state, thread, input, ctx);
  if (input.beats.length > 0 && scripted.rest.length === 0) {
    return { state: scripted.state, effect: null };
  }
  const beats = scripted.rest;
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const speakers = [
    ...thread.present.map(speakerView),
    ...(beats.some((beat) => beat.speaker === 'PHARMACY')
      ? [speakerView(pharmacySpeaker(ctx))]
      : []),
  ];
  const allowedTokens = Object.keys(input.tokens);
  const context = {
    prompt: {
      patientId: patient.id,
      speakers,
      addressed: input.addressed,
      beats,
      allowedTokens,
      card: patientCard(scripted.state, patient.id),
      ...(input.resolvedOrder ? { order: input.resolvedOrder } : {}),
      recent: recentLines(
        scripted.state.chats[patient.id] ?? thread,
        ctx.config.chat.recentLinesForContext,
      ),
      maxLines: ctx.config.chat.maxLinesPerTurn,
      maxLineChars: ctx.config.chat.maxLineChars,
    },
    local: {
      patientId: patient.id,
      speakerIds: speakers.map((s) => s.id),
      allowedTokens,
      denyTerms: template ? [...template.diagnosisTerms] : [],
      frozenTokens: input.tokens,
      liveTokens: liveTokensOf(beats),
    },
  } satisfies JsonValue;
  return requestAi(scripted.state, DIALOGUE_KIND, context);
}

const resultSchema = z.object({
  lines: z.array(z.object({ speaker: z.string(), text: z.string() })).min(1),
});

const localSchema = z.object({
  patientId: z.string(),
  speakerIds: z.array(z.string()),
  allowedTokens: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
  liveTokens: z.array(z.string()).default([]),
});

export function appendLine(
  state: GameState,
  line: Omit<ChatLine, 'id' | 'source'> & { source?: ChatLine['source'] },
): GameState {
  const thread = state.chats[line.patientId];
  if (!thread) return state;
  const id = `c${String(state.counters.line + 1)}`;
  return {
    ...state,
    counters: { ...state.counters, line: state.counters.line + 1 },
    chats: {
      ...state.chats,
      [line.patientId]: {
        ...thread,
        lines: [...thread.lines, { ...line, id, source: line.source ?? 'BEDSIDE' }],
      },
    },
  };
}

/**
 * 套用 AI 嘅 dialogue.turn 結果。呢度只會寫入 ChatLine：任何其他欄位、診斷、數值一律唔讀。
 * 語意違規（未授權 speaker／token、裸數字）＝ AI 失敗，唔套用任何內容。
 */
export function handleDialogueResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const parsedPayload = resultSchema.safeParse(payload);
  const context = z.object({ local: localSchema }).safeParse(pending.context);
  if (!parsedPayload.success || !context.success) return rejectAiResult(state, pending);

  const { local } = context.data;
  const thread = state.chats[local.patientId];
  if (!thread) return { state, effects: [] };

  const { maxLinesPerTurn, maxLineChars } = ctx.config.chat;
  const lines = parsedPayload.data.lines;
  const allowed = new Set(local.allowedTokens);
  const patient = state.patients[local.patientId];
  const denyTerms =
    ctx.tables['case-templates'].find((c) => c.id === patient?.hidden.caseTemplateId)
      ?.diagnosisTerms ?? [];
  const speakers = new Map<string, SpeakerLike>([
    ...thread.present.map((p) => [p.id, p] as const),
    [PHARMACY_SPEAKER_ID, pharmacySpeaker(ctx)],
  ]);
  if (lines.length > maxLinesPerTurn) return rejectAiResult(state, pending);
  const live = new Set(local.liveTokens);
  const liveValues = patient ? vitalTokens(patient, ctx.tables) : {};

  let next = state;
  for (const line of lines) {
    const speaker = speakers.get(line.speaker);
    if (!speaker || !local.speakerIds.includes(line.speaker)) return rejectAiResult(state, pending);
    if (validateTemplate(line.text, allowed, maxLineChars) !== null) {
      return rejectAiResult(state, pending);
    }
    if (leaksDiagnosis(line.text, denyTerms)) return rejectAiResult(state, pending);
    const used = extractTokens(line.text);
    const tokenValues: Record<string, string> = {};
    for (const token of used) {
      const value = live.has(token)
        ? (liveValues[token] ?? local.frozenTokens[token])
        : local.frozenTokens[token];
      if (value === undefined) return rejectAiResult(state, pending);
      tokenValues[token] = value;
    }
    next = appendLine(next, {
      t: state.clock.t,
      patientId: local.patientId,
      speaker: { kind: speaker.kind, id: speaker.id },
      template: line.text,
      tokenValues,
      orderId: null,
      source: speaker.kind === 'PHARMACY' ? 'PHONE' : 'BEDSIDE',
    });
  }
  return { state: next, effects: [] };
}

/** UI「輸入中」：由 pending 請求推算邊啲角色而家正喺度回應 */
export function typingSpeakerIds(state: GameState): string[] {
  const ids = new Set<string>();
  for (const pending of state.pendingAi) {
    const parsed = z
      .object({
        prompt: z
          .object({
            patientId: z.string(),
            beats: z.array(z.object({ speaker: z.string() }).loose()).optional(),
          })
          .loose(),
      })
      .safeParse(pending.context);
    if (!parsed.success) continue;
    const thread = state.chats[parsed.data.prompt.patientId];
    if (!thread) continue;
    if (pending.kind === DIALOGUE_KIND) {
      for (const beat of parsed.data.prompt.beats ?? []) {
        const speaker = thread.present.find((p) => p.kind === beat.speaker);
        if (speaker) ids.add(speaker.id);
      }
    } else {
      const nurse = thread.present.find((p) => p.kind === 'NURSE');
      if (nurse) ids.add(nurse.id);
    }
  }
  return [...ids];
}
