/**
 * 對白管線（implementation-plan §2.4、§7.2 dialogue.turn）：
 * engine 先決定「發生咗咩」（beats）同凍結 token 值，AI 只負責措辭。
 * Token 於 queue 嗰刻凍結並寫入 pending context，所以 AI 慢返嚟、或者存檔重試，對白數值都唔會變。
 */
import { z } from 'zod';
import { meanArterialPressure } from '../case/mews';
import type { Patient } from '../case/patient';
import { MEWS_COMPONENT_KEYS, type EngineTables, type MewsComponentKey } from '../case/tables';
import { rejectAiResult, requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import type { ChatLine, ChatThread, Present } from './chatTypes';
import { extractTokens, leaksDiagnosis, validateTemplate } from './tokens';

export const DIALOGUE_KIND = 'dialogue.turn';

// JSON 相容（有隱含 index signature）先可以放入 AI context，所以用 type 而唔係 interface
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Abnormal = {
  key: MewsComponentKey;
  direction: 'LOW' | 'HIGH';
};

export type Beat =
  | { type: 'ACK_ORDER'; speaker: 'NURSE'; labelToken: string }
  | { type: 'ORDER_CANCELLED'; speaker: 'NURSE'; labelToken: string }
  | {
      type: 'REPORT_RESULT';
      speaker: 'NURSE';
      labelToken: string;
      tokens: string[];
      abnormal: Abnormal[];
    }
  | { type: 'REPORT_STATUS'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | { type: 'ALERT_DETERIORATION'; speaker: 'NURSE'; tokens: string[]; abnormal: Abnormal[] }
  | { type: 'PATIENT_SPEAKS'; speaker: 'PATIENT'; symptoms: string[] }
  | { type: 'ACK_CHAT'; speaker: 'NURSE' }
  | { type: 'ASK_REPHRASE'; speaker: 'NURSE'; reason: 'UNKNOWN_ORDER' | 'UNSUPPORTED' };

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
  const rhythm = tables.rhythms.find((r) => r.id === patient.visible.rhythm);
  return {
    'vital.hr': String(v.hr),
    'vital.sbp': String(v.sbp),
    'vital.dbp': String(v.dbp),
    'vital.map': String(meanArterialPressure(v.sbp, v.dbp)),
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
}

function speakerView(present: Present) {
  return { id: present.id, kind: present.kind, name: present.name, tone: present.tone };
}

function recentLines(thread: ChatThread, limit: number) {
  return thread.lines.slice(-limit).map((line) => ({
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
): { state: GameState; effect: Effect } | undefined {
  const patient = state.patients[input.patientId];
  const thread = state.chats[input.patientId];
  if (!patient || !thread) return undefined;
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const speakers = thread.present.map(speakerView);
  const allowedTokens = Object.keys(input.tokens);
  const context = {
    prompt: {
      patientId: patient.id,
      speakers,
      addressed: input.addressed,
      beats: input.beats,
      allowedTokens,
      recent: recentLines(thread, ctx.config.chat.recentLinesForContext),
      maxLines: ctx.config.chat.maxLinesPerTurn,
      maxLineChars: ctx.config.chat.maxLineChars,
    },
    local: {
      patientId: patient.id,
      speakerIds: speakers.map((s) => s.id),
      allowedTokens,
      denyTerms: template ? [...template.diagnosisTerms] : [],
      frozenTokens: input.tokens,
    },
  } satisfies JsonValue;
  return requestAi(state, DIALOGUE_KIND, context);
}

const resultSchema = z.object({
  lines: z.array(z.object({ speaker: z.string(), text: z.string() })).min(1),
});

const localSchema = z.object({
  patientId: z.string(),
  speakerIds: z.array(z.string()),
  allowedTokens: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
});

export function appendLine(state: GameState, line: Omit<ChatLine, 'id' | 'source'>): GameState {
  const thread = state.chats[line.patientId];
  if (!thread) return state;
  const id = `c${String(state.counters.line + 1)}`;
  return {
    ...state,
    counters: { ...state.counters, line: state.counters.line + 1 },
    chats: {
      ...state.chats,
      [line.patientId]: { ...thread, lines: [...thread.lines, { ...line, id, source: 'BEDSIDE' }] },
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
  const speakers = new Map(thread.present.map((p) => [p.id, p]));
  if (lines.length > maxLinesPerTurn) return rejectAiResult(state, pending);

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
      const value = local.frozenTokens[token];
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
