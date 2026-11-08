/**
 * 死亡後致電家屬（spec §18、M4b）。
 * 玩家揀四個預設講法之一，或者自己打字：
 * - 預設講法本身帶有一組「訊號」（STATES_DEATH、CONDOLENCE…）；
 * - 自己打字就由 AI（family.assess）抽出訊號，AI 唔會評分、唔會決定家屬反應；
 * - engine 按訊號計「有冇講清楚」「有冇同理心」，查 T27 反應表同計分規則；
 * - 預設選項的家屬對白由狀態機反應揀固定句；自己打字先交 family.reply 措辭。
 */
import { z } from 'zod';
import { patientTokens } from '../chat/dialogue';
import { extractTokens, renderTemplate } from '../chat/tokens';
import {
  FAMILY_SIGNAL_IDS,
  type FamilyOptionRow,
  type FamilyScenarioRow,
  type FamilySignal,
} from '../case/tables';
import { rejectAiResult, requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import { completeDeathStep } from '../death/death';
import { applyCalleeLines, FAMILY_REPLY_KIND, requestCalleeReply } from './callReply';
import { familyPresetTemplate } from './scriptedLines';
import { findCall, notice, playerTemplate, putCall } from './callStore';
import { applyRule } from '../score/scoring';
import type { Call, CallLine, Exchange, FamilyExchange } from './wardTypes';

export const FAMILY_ASSESS_KIND = 'family.assess';
export const FAMILY_TEMPLATE_ID = 'FAMILY_DEATH';
/** 一句說話最多可以同時帶幾多個訊號（最豐富嘅預設講法有 4 個） */
export const MAX_SIGNALS_PER_TEXT = 5;

const ASSERTIVE: readonly FamilySignal[] = ['CONDOLENCE', 'OFFERS_SUPPORT', 'EXPLAINS_EVENTS'];

export function familyScenarioOf(ctx: EngineContext): FamilyScenarioRow | undefined {
  return ctx.tables['family-scenarios'][0];
}

/** 訊號互相矛盾（又冷淡又有慰問）：多數係 AI 被玩家文字牽住走，當 AI 失敗 */
export function signalsConsistent(signals: readonly FamilySignal[]): boolean {
  if (signals.length > MAX_SIGNALS_PER_TEXT) return false;
  if (new Set(signals).size !== signals.length) return false;
  const blunt = signals.includes('BLUNT_OR_COLD');
  if (blunt && signals.some((s) => ASSERTIVE.includes(s))) return false;
  if (signals.includes('STATES_DEATH') && signals.includes('HINTS_SERIOUS')) return false;
  return true;
}

export function clarityOfSignals(signals: readonly FamilySignal[]): 0 | 1 | 2 {
  if (signals.includes('STATES_DEATH')) return signals.includes('JARGON') ? 1 : 2;
  return signals.includes('HINTS_SERIOUS') ? 1 : 0;
}

/** 冷淡＝0；一般＝1；同時有慰問同（支援或交代經過）＝2 */
export function empathyOfSignals(signals: readonly FamilySignal[]): 0 | 1 | 2 {
  if (signals.includes('BLUNT_OR_COLD')) return 0;
  const warm =
    signals.includes('CONDOLENCE') &&
    (signals.includes('OFFERS_SUPPORT') || signals.includes('EXPLAINS_EVENTS'));
  return warm ? 2 : 1;
}

const isActive = (call: Call) =>
  call.purpose === 'DEATH_FAMILY' && call.exchange !== null && call.exchange.phase !== 'CLOSED';

export function startFamilyCall(state: GameState, ctx: EngineContext): Reduction {
  const death = state.death;
  const scenario = familyScenarioOf(ctx);
  if (death?.status !== 'PENDING_PROCESS' || death.steps.PHONE_FAMILY !== null || !scenario) {
    return { state, effects: [notice('CALL_TARGET_INVALID')] };
  }
  if (state.ward.calls.some(isActive)) return { state, effects: [] };
  const patient = state.patients[death.patientId];
  if (!patient) return { state, effects: [notice('PATIENT_UNKNOWN')] };
  const t = state.clock.t;
  const id = `k${String(state.ward.counters.call + 1)}`;
  const call: Call = {
    id,
    templateId: FAMILY_TEMPLATE_ID,
    direction: 'OUT',
    tag: 'FAMILY',
    priority: 'ROUTINE',
    callerName: scenario.calleeName,
    callerRank: null,
    patientId: patient.id,
    deptId: null,
    target: null,
    status: 'DONE',
    resolution: 'SENT',
    arrivedAt: t,
    expiresAt: t,
    ringAgainAt: null,
    defers: 0,
    delegable: false,
    sbar: null,
    outcome: null,
    lines: [
      {
        t,
        speaker: 'CALLEE',
        name: scenario.calleeName,
        template: scenario.pickup,
        tokenValues: {},
      },
    ],
    purpose: 'DEATH_FAMILY',
    exchange: {
      phase: 'OPEN',
      reqId: null,
      consult: null,
      family: { stage: 'OPENING', turns: 0, informed: false, applied: [] },
    },
  };
  const next: GameState = {
    ...state,
    ward: {
      ...state.ward,
      counters: { ...state.ward.counters, call: state.ward.counters.call + 1 },
    },
  };
  return { state: putCall(next, call), effects: [] };
}

function openCall(state: GameState, callId: string): { call: Call; family: FamilyExchange } | null {
  const call = findCall(state, callId);
  const family = call?.exchange?.family;
  if (call?.purpose !== 'DEATH_FAMILY' || !family || call.exchange?.phase !== 'OPEN') return null;
  return { call, family };
}

function playerLine(
  state: GameState,
  template: string,
  tokenValues: Record<string, string>,
): CallLine {
  return { t: state.clock.t, speaker: 'PLAYER', name: '', template, tokenValues };
}

export function familyOption(
  state: GameState,
  callId: string,
  optionId: string,
  ctx: EngineContext,
): Reduction {
  const open = openCall(state, callId);
  const scenario = familyScenarioOf(ctx);
  if (!open || !scenario) return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  const option: FamilyOptionRow | undefined = scenario.stages[open.family.stage].find(
    (o) => o.id === optionId,
  );
  const patient = open.call.patientId ? state.patients[open.call.patientId] : undefined;
  if (!option || !patient) return { state, effects: [notice('CALL_TARGET_INVALID')] };
  const line = playerLine(state, option.line, { 'patient.name': patient.demographics.name });
  return resolveTurn(
    putCall(state, { ...open.call, lines: [...open.call.lines, line] }),
    callId,
    [...option.signals],
    renderTemplate(option.line, { 'patient.name': patient.demographics.name }),
    ctx,
    true,
  );
}

export function familySay(
  state: GameState,
  callId: string,
  rawText: string,
  ctx: EngineContext,
): Reduction {
  const open = openCall(state, callId);
  if (!open) return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  const text = rawText.trim();
  if (text.length === 0) return { state, effects: [notice('CHAT_EMPTY')] };
  if (text.length > ctx.config.consult.followupMaxChars) {
    return { state, effects: [notice('CHAT_TOO_LONG')] };
  }
  const withLine: Call = {
    ...open.call,
    lines: [...open.call.lines, playerLine(state, playerTemplate(text), {})],
  };
  const context = {
    prompt: { stage: open.family.stage, text },
    local: { callId, text },
  } satisfies JsonValue;
  const requested = requestAi(putCall(state, withLine), FAMILY_ASSESS_KIND, context);
  const reqId = requested.effect.type === 'AI_REQUEST' ? requested.effect.reqId : '';
  const exchange: Exchange = { phase: 'ASSESSING', reqId, consult: null, family: open.family };
  return {
    state: putCall(requested.state, { ...withLine, exchange }),
    effects: [requested.effect],
  };
}

const assessDataSchema = z.object({ signals: z.array(z.enum(FAMILY_SIGNAL_IDS)) });
const assessLocalSchema = z.object({ callId: z.string(), text: z.string() });

export function handleFamilyAssessResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const data = assessDataSchema.safeParse(payload);
  const context = z.object({ local: assessLocalSchema }).safeParse(pending.context);
  if (!data.success || !context.success) return rejectAiResult(state, pending);
  const { local } = context.data;
  const call = findCall(state, local.callId);
  if (call?.exchange?.reqId !== pending.reqId || !call.exchange.family) {
    return { state, effects: [] };
  }
  const signals = data.data.signals;
  if (!signalsConsistent(signals)) return rejectAiResult(state, pending);
  return resolveTurn(state, call.id, signals, local.text, ctx, false);
}

function resolveTurn(
  state: GameState,
  callId: string,
  signals: readonly FamilySignal[],
  doctorSaid: string,
  ctx: EngineContext,
  preset: boolean,
): Reduction {
  const call = findCall(state, callId);
  const family = call?.exchange?.family;
  const scenario = familyScenarioOf(ctx);
  const patient = call?.patientId ? state.patients[call.patientId] : undefined;
  if (!call || !family || !scenario || !patient) return { state, effects: [] };

  const informedNow = family.informed || signals.includes('STATES_DEATH');
  const clarity = clarityOfSignals(signals);
  const empathy = empathyOfSignals(signals);
  const targets = { callId, patientId: patient.id, evidence: `call:${callId}` };

  let next = state;
  const applied = [...family.applied];
  const candidates = [
    scenario.scoring.empathy[empathy],
    family.informed ? null : scenario.scoring.clarity[clarity],
  ];
  for (const ruleId of candidates) {
    if (!ruleId || applied.includes(ruleId)) continue;
    next = applyRule(next, ruleId, ctx, targets);
    applied.push(ruleId);
  }

  let effects: Effect[] = [];
  if (informedNow && !family.informed) {
    const done = completeDeathStep(next, 'PHONE_FAMILY');
    next = done.state;
    effects = done.effects;
  }

  const turns = family.turns + 1;
  const closing = turns >= ctx.config.family.maxTurns;
  const reaction = scenario.reactions.find(
    (r) => r.informed === informedNow && r.empathy === empathy,
  );
  const nextFamily: FamilyExchange = {
    stage: informedNow ? 'FOLLOWUP' : 'OPENING',
    turns,
    informed: informedNow,
    applied,
  };
  const tokens = patientTokens(patient);
  const reactionId = reaction?.reaction ?? 'CONFUSED';
  const asks = closing ? 'NONE' : (reaction?.asks ?? 'NONE');
  if (preset) {
    const template = familyPresetTemplate(reactionId, asks, closing);
    const tokenValues: Record<string, string> = {};
    for (const token of extractTokens(template)) {
      const value = tokens[token];
      if (value !== undefined) tokenValues[token] = value;
    }
    const reply: CallLine = {
      t: next.clock.t,
      speaker: 'CALLEE',
      name: scenario.calleeName,
      template,
      tokenValues,
    };
    const exchange: Exchange = {
      phase: closing ? 'CLOSED' : 'OPEN',
      reqId: null,
      consult: null,
      family: nextFamily,
    };
    return {
      state: putCall(next, { ...call, lines: [...call.lines, reply], exchange }),
      effects,
    };
  }
  const requested = requestCalleeReply(
    next,
    {
      kind: FAMILY_REPLY_KIND,
      call,
      callee: { name: scenario.calleeName, kind: 'FAMILY', rank: null, attitude: null },
      beats: [
        {
          type: 'FAMILY_REACT',
          stage: family.stage,
          informed: informedNow,
          reaction: reaction?.reaction ?? 'CONFUSED',
          asks: closing ? 'NONE' : (reaction?.asks ?? 'NONE'),
          closing,
        },
      ],
      doctorSaid,
      tokens,
      denyTerms: [],
    },
    ctx,
  );
  const exchange: Exchange = {
    phase: 'AWAITING_REPLY',
    reqId: requested.reqId,
    consult: null,
    family: nextFamily,
  };
  return {
    state: putCall(requested.state, { ...call, exchange }),
    effects: [...effects, requested.effect],
  };
}

export function handleFamilyReplyResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const applied = applyCalleeLines(state, pending, payload, ctx);
  if (applied.kind === 'reject') return rejectAiResult(state, pending);
  if (applied.kind === 'stale') return { state, effects: [] };
  const { call } = applied;
  const family = call.exchange?.family ?? null;
  const open = family !== null && family.turns < ctx.config.family.maxTurns;
  const exchange: Exchange = {
    phase: open ? 'OPEN' : 'CLOSED',
    reqId: null,
    consult: null,
    family,
  };
  return { state: putCall(applied.state, { ...call, exchange }), effects: [] };
}

/** 玩家掛線：已經講咗死訊嘅話，家屬以固定收尾句結束（唔使 AI） */
export function endFamilyCall(state: GameState, callId: string, ctx: EngineContext): Reduction {
  const open = openCall(state, callId);
  const scenario = familyScenarioOf(ctx);
  if (!open || !scenario) return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  const closingLine: CallLine[] = open.family.informed
    ? [
        {
          t: state.clock.t,
          speaker: 'CALLEE',
          name: scenario.calleeName,
          template: scenario.closing,
          tokenValues: {},
        },
      ]
    : [];
  const exchange: Exchange = { phase: 'CLOSED', reqId: null, consult: null, family: open.family };
  return {
    state: putCall(state, { ...open.call, lines: [...open.call.lines, ...closingLine], exchange }),
    effects: [],
  };
}
