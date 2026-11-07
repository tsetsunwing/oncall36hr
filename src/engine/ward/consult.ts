/**
 * 外撥電話：逐級上報、其他專科會診、死亡後通知上一級（spec §5、§18、plan §7.2 consult.*）。
 *
 * 分工（B1、spec §23.1）：
 * - AI（consult.assess）只做「理解」：由玩家自己寫嘅 SBAR／跟進文字抽出佢講咗清單上邊啲項目、
 *   逐字引用嘅生命體徵數值、語氣；
 * - engine 用 config.consult 清單計清晰度、核對數值、按 T18／T24 同印象決定來唔來、幾耐到；
 * - AI（consult.reply）只將 engine 已決定嘅結果講成對白，對白入面嘅數值只可以係凍結 token。
 * 玩家冇改動 engine 預填嘅 SBAR 時，內容本身就係 engine 寫嘅，唔使 AI 理解。
 */
import { z } from 'zod';
import { patientTokens } from '../chat/dialogue';
import {
  VITAL_KEYS,
  type ConsultDepartmentRow,
  type Priority,
  type VitalKey,
} from '../case/tables';
import { rejectAiResult, requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import { completeDeathStep } from '../death/death';
import {
  applyCalleeLines,
  CONSULT_REPLY_KIND,
  requestCalleeReply,
  type ReplyInput,
} from './callReply';
import {
  CONSULT_ARRIVAL_EVENT,
  findCall,
  notice,
  playerTemplate,
  putCall,
  scheduleCallEvent,
} from './callStore';
import { addPatientFlag } from './movement';
import { applyRule, impressionBand, impressionOf } from '../score/scoring';
import {
  RANKS,
  sbarSchema,
  TONES,
  type Call,
  type CallLine,
  type CallTarget,
  type ConsultExchange,
  type Exchange,
  type Rank,
  type Sbar,
  type Tone,
  type VitalsRef,
} from './wardTypes';

export const CONSULT_ASSESS_KIND = 'consult.assess';
export { CONSULT_REPLY_KIND };

const PARTS = ['S', 'B', 'A', 'R'] as const;

// ---------- 基本查詢 ----------

const RANK_ORDER = RANKS;

/** 玩家以上嘅職級（可以致電） */
export function reachableRanks(playerRank: string): Rank[] {
  const index = RANK_ORDER.indexOf(playerRank as Rank);
  return index < 0 ? [] : RANK_ORDER.slice(index + 1);
}

export function skippedRanks(state: GameState, patientId: string, target: Rank): Rank[] {
  const start = RANK_ORDER.indexOf(state.playerRank);
  const end = RANK_ORDER.indexOf(target);
  const contacted = state.ward.contacts[patientId] ?? [];
  return RANK_ORDER.slice(start + 1, end).filter((rank) => !contacted.includes(rank));
}

export function urgencyOf(state: GameState, patientId: string, ctx: EngineContext): Priority {
  const patient = state.patients[patientId];
  const bands = ctx.tables.mews[0]?.bands ?? [];
  const index = bands.findIndex((b) => b.id === patient?.visible.mews.band);
  if (index >= 3) return 'EMERGENCY';
  if (index === 2) return 'URGENT';
  return 'ROUTINE';
}

function deptOf(ctx: EngineContext, deptId: string): ConsultDepartmentRow | undefined {
  return ctx.tables['consult-departments'].find((d) => d.id === deptId);
}

export function targetValid(state: GameState, target: CallTarget, ctx: EngineContext): boolean {
  if (target.kind === 'RANK') return reachableRanks(state.playerRank).includes(target.rank);
  return deptOf(ctx, target.deptId) !== undefined;
}

export function vitalsRefOf(state: GameState, patientId: string): VitalsRef | undefined {
  const v = state.patients[patientId]?.visible.vitals;
  return v ? { hr: v.hr, sbp: v.sbp, dbp: v.dbp, spo2: v.spo2, rr: v.rr, temp: v.temp } : undefined;
}

// ---------- 評分（純 engine） ----------

export interface Assessment {
  covered: string[];
  quoted: { key: VitalKey; value: number }[];
  tone: Tone;
}

/** 清晰度 0–3：四段（S／B／A／R）每段只要覆蓋清單入面其中一項就算齊；齊 n 段＝n−1，講錯數值再減 1 */
export function clarityOf(ctx: EngineContext, covered: readonly string[], inaccurate: boolean) {
  const { partAnyOf } = ctx.config.consult;
  const satisfied = PARTS.filter((part) => partAnyOf[part].some((id) => covered.includes(id)));
  const base = Math.max(0, satisfied.length - 1);
  return inaccurate ? Math.max(0, base - 1) : base;
}

/** 玩家引用嘅數值同 engine 嘅真實讀數（現時或起草時）都對唔上，先算講錯 */
export function isInaccurate(
  ctx: EngineContext,
  state: GameState,
  patientId: string,
  ref: VitalsRef,
  quoted: Assessment['quoted'],
): boolean {
  const current = vitalsRefOf(state, patientId);
  if (!current) return false;
  const tolerance = ctx.config.consult.vitalTolerance;
  return quoted.some((q) => {
    const near = (reading: number) => Math.abs(reading - q.value) <= tolerance[q.key];
    return !(near(current[q.key]) || near(ref[q.key]));
  });
}

/** 冇改動 engine 預填內容：每個有內容嘅段落，視為覆蓋該段全部項目 */
function uneditedAssessment(sbar: Sbar, ctx: EngineContext): Assessment {
  const covered = ctx.config.consult.items
    .filter((item) => sbar[item.part].trim().length > 0)
    .map((item) => item.id);
  return { covered, quoted: [], tone: 'NEUTRAL' };
}

const OUTCOME_LEVEL: Record<string, number> = {
  REFUSE: 0,
  ADVICE: 1,
  BEDSIDE: 2,
  ICU_ASSESS: 2,
  DEATH_ACK: 3,
};

interface Decision {
  outcome: string;
  arrivalDelay: number | null;
  calleeRank: Rank | null;
  attitude: 'WARM' | 'NEUTRAL' | 'COLD' | null;
  questionDepth: number;
}

function decide(state: GameState, call: Call, clarity: number, ctx: EngineContext): Decision {
  const target = call.target;
  const patientId = call.patientId;
  if (!target || !patientId) {
    return {
      outcome: 'REFUSE',
      arrivalDelay: null,
      calleeRank: null,
      attitude: null,
      questionDepth: 0,
    };
  }
  if (target.kind === 'RANK') {
    if (call.purpose === 'DEATH_SENIOR') {
      return {
        outcome: 'DEATH_ACK',
        arrivalDelay: null,
        calleeRank: target.rank,
        attitude: impressionBand(impressionOf(state, target.rank, ctx), ctx),
        questionDepth: 0,
      };
    }
    const behaviour = ctx.tables['rank-behaviour'].find((r) => r.id === target.rank);
    const band = impressionBand(impressionOf(state, target.rank, ctx), ctx);
    const rule = behaviour?.bands[band];
    const base = { calleeRank: target.rank, attitude: band };
    if (!rule) return { ...base, outcome: 'REFUSE', arrivalDelay: null, questionDepth: 0 };
    if (clarity >= rule.bedsideMinClarity) {
      return {
        ...base,
        outcome: 'BEDSIDE',
        arrivalDelay: rule.reactionSec,
        questionDepth: rule.questionDepth,
      };
    }
    if (clarity >= rule.adviceMinClarity) {
      return { ...base, outcome: 'ADVICE', arrivalDelay: null, questionDepth: rule.questionDepth };
    }
    return { ...base, outcome: 'REFUSE', arrivalDelay: null, questionDepth: rule.questionDepth };
  }
  const dept = deptOf(ctx, target.deptId);
  const base = {
    calleeRank: null,
    attitude: null,
    questionDepth: ctx.config.consult.deptQuestionDepth,
  };
  if (!dept || clarity < dept.acceptMinClarity) {
    return { ...base, outcome: 'REFUSE', arrivalDelay: null };
  }
  if (dept.kind === 'ICU' && dept.icu) {
    return { ...base, outcome: 'ICU_ASSESS', arrivalDelay: dept.icu.assessSec };
  }
  const urgency = urgencyOf(state, patientId, ctx);
  if (dept.bedsideByUrgency[urgency] === 'BEDSIDE') {
    return { ...base, outcome: 'BEDSIDE', arrivalDelay: dept.reactionSec.BEDSIDE };
  }
  return { ...base, outcome: 'ADVICE', arrivalDelay: null };
}

function askedItems(
  ctx: EngineContext,
  covered: readonly string[],
  depth: number,
  followups: number,
): string[] {
  if (followups >= ctx.config.consult.maxFollowups) return [];
  return ctx.config.consult.askOrder.filter((id) => !covered.includes(id)).slice(0, depth);
}

// ---------- 送出 SBAR ----------

const sbarParts = (sbar: Sbar): string[] => PARTS.map((part) => sbar[part]);

export function sendEscalation(state: GameState, sbar: Sbar, ctx: EngineContext): Reduction {
  const draft = state.ward.draft;
  if (!draft) return { state, effects: [notice('SBAR_INVALID')] };
  const max = ctx.config.phone.sbarMaxChars;
  if (sbarParts(sbar).some((part) => part.length > max)) {
    return { state, effects: [notice('SBAR_INVALID')] };
  }
  const { patientId, target, purpose } = draft;
  const patient = state.patients[patientId];
  if (!patient || !targetValid(state, target, ctx)) {
    return { state, effects: [notice('CALL_TARGET_INVALID')] };
  }

  const t = state.clock.t;
  const id = `k${String(state.ward.counters.call + 1)}`;
  let next: GameState = {
    ...state,
    ward: {
      ...state.ward,
      draft: null,
      counters: { ...state.ward.counters, call: state.ward.counters.call + 1 },
    },
  };
  const lines: CallLine[] = PARTS.filter((key) => sbar[key].trim().length > 0).map((key) => ({
    t,
    speaker: 'PLAYER',
    name: key,
    template: playerTemplate(sbar[key]),
    tokenValues: {},
  }));

  let calleeName = '';
  let calleeRank: Rank | null = null;
  if (target.kind === 'RANK') {
    calleeRank = target.rank;
    calleeName = target.rank;
    const skipped = skippedRanks(next, patientId, target.rank);
    next = applyRule(
      next,
      skipped.length > 0 ? 'ESCALATION_SKIPPED_LEVEL' : 'ESCALATION_STEP_OK',
      ctx,
      {
        skipped,
        callId: id,
        patientId,
        evidence: `call:${id}`,
        facts: { callee: target.rank, skipped: skipped.join(',') },
      },
    );
    const contacted = next.ward.contacts[patientId] ?? [];
    next = {
      ...next,
      ward: {
        ...next.ward,
        contacts: {
          ...next.ward.contacts,
          [patientId]: contacted.includes(target.rank) ? contacted : [...contacted, target.rank],
        },
      },
    };
  } else {
    calleeName = deptOf(ctx, target.deptId)?.label ?? '';
  }

  const call: Call = {
    id,
    templateId: 'OUTGOING',
    direction: 'OUT',
    tag: 'OUTGOING',
    priority: urgencyOf(next, patientId, ctx),
    callerName: calleeName,
    callerRank: calleeRank,
    patientId,
    deptId: target.kind === 'DEPT' ? target.deptId : null,
    target,
    status: 'DONE',
    resolution: 'SENT',
    arrivedAt: t,
    expiresAt: t,
    ringAgainAt: null,
    defers: 0,
    delegable: false,
    sbar,
    outcome: null,
    lines,
    purpose,
    exchange: null,
  };
  next = putCall(next, call);

  let effects: Effect[] = [];
  if (purpose === 'DEATH_SENIOR') {
    const done = completeDeathStep(next, 'NOTIFY_SENIOR');
    next = done.state;
    effects = [...effects, ...done.effects];
  }

  const edited = PARTS.some((part) => sbar[part].trim() !== draft.sbar[part].trim());
  if (!edited) {
    const resolved = resolveInitial(next, id, uneditedAssessment(sbar, ctx), draft.vitalsRef, ctx);
    return { state: resolved.state, effects: [...effects, ...resolved.effects] };
  }
  const requested = requestAssess(
    next,
    call,
    { mode: 'INITIAL', sbar, followup: null, asked: [], vitalsRef: draft.vitalsRef },
    ctx,
  );
  return { state: requested.state, effects: [...effects, requested.effect] };
}

// ---------- consult.assess：請求 ----------

interface AssessInput {
  mode: 'INITIAL' | 'FOLLOWUP';
  sbar: Sbar;
  followup: string | null;
  asked: string[];
  vitalsRef: VitalsRef;
}

function targetLabel(call: Call, ctx: EngineContext): { kind: 'RANK' | 'DEPT'; label: string } {
  return call.target?.kind === 'DEPT'
    ? { kind: 'DEPT', label: deptOf(ctx, call.target.deptId)?.label ?? call.callerName }
    : { kind: 'RANK', label: call.callerRank ?? call.callerName };
}

function requestAssess(
  state: GameState,
  call: Call,
  input: AssessInput,
  ctx: EngineContext,
): { state: GameState; effect: Effect } {
  const playerText = [...sbarParts(input.sbar), input.followup ?? ''].join('\n');
  const context = {
    prompt: {
      mode: input.mode,
      target: targetLabel(call, ctx),
      sbar: input.sbar,
      followup: input.followup,
      askedItems: input.asked,
      items: ctx.config.consult.items.map((i) => ({
        id: i.id,
        part: i.part,
        description: i.description,
      })),
      vitalKeys: [...VITAL_KEYS],
      maxQuotes: ctx.config.consult.maxQuotes,
    },
    local: {
      callId: call.id,
      patientId: call.patientId ?? '',
      mode: input.mode,
      parts: input.sbar,
      followup: input.followup,
      playerText,
      vitalsRef: input.vitalsRef,
    },
  } satisfies JsonValue;
  const requested = requestAi(state, CONSULT_ASSESS_KIND, context);
  const reqId = requested.effect.type === 'AI_REQUEST' ? requested.effect.reqId : '';
  const exchange: Exchange = {
    phase: 'ASSESSING',
    reqId,
    consult: call.exchange?.consult ?? null,
    family: null,
  };
  return {
    state: putCall(requested.state, { ...call, exchange }),
    effect: requested.effect,
  };
}

// ---------- consult.assess：結果 ----------

const assessDataSchema = z.object({
  parts: z.object({
    S: z.array(z.string()),
    B: z.array(z.string()),
    A: z.array(z.string()),
    R: z.array(z.string()),
  }),
  quoted: z.array(z.object({ key: z.enum(VITAL_KEYS), value: z.number() })).default([]),
  tone: z.enum(TONES).default('NEUTRAL'),
});

const vitalsRefSchema = z.object({
  hr: z.number(),
  sbp: z.number(),
  dbp: z.number(),
  spo2: z.number(),
  rr: z.number(),
  temp: z.number(),
});

const assessLocalSchema = z.object({
  callId: z.string(),
  patientId: z.string(),
  mode: z.enum(['INITIAL', 'FOLLOWUP']),
  parts: sbarSchema,
  followup: z.string().nullable(),
  playerText: z.string(),
  vitalsRef: vitalsRefSchema,
});

export function numbersIn(text: string): number[] {
  return [...text.normalize('NFKC').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

export function handleAssessResult(
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
  if (call?.exchange?.reqId !== pending.reqId) return { state, effects: [] };

  const items = new Map(ctx.config.consult.items.map((i) => [i.id, i.part] as const));
  const spoken = numbersIn(local.playerText);
  const covered: string[] = [];
  for (const part of PARTS) {
    const text = local.mode === 'FOLLOWUP' ? (local.followup ?? '') : local.parts[part];
    for (const itemId of data.data.parts[part]) {
      if (items.get(itemId) !== part) return rejectAiResult(state, pending);
      if (text.trim().length === 0) return rejectAiResult(state, pending);
      if (!covered.includes(itemId)) covered.push(itemId);
    }
  }
  const quoted = data.data.quoted;
  if (quoted.length > ctx.config.consult.maxQuotes) return rejectAiResult(state, pending);
  if (quoted.some((q) => !spoken.includes(q.value))) return rejectAiResult(state, pending);

  const assessment: Assessment = { covered, quoted, tone: data.data.tone };
  return local.mode === 'INITIAL'
    ? resolveInitial(state, call.id, assessment, local.vitalsRef, ctx)
    : resolveFollowup(state, call.id, assessment, ctx);
}

// ---------- 決定結果（engine） ----------

function applyArrival(state: GameState, call: Call, decision: Decision): GameState {
  if (decision.arrivalDelay === null) return state;
  return scheduleCallEvent(state, state.clock.t + decision.arrivalDelay, CONSULT_ARRIVAL_EVENT, {
    callId: call.id,
  });
}

function flagAdvice(state: GameState, call: Call, outcome: string): GameState {
  if (outcome !== 'ADVICE' || !call.patientId) return state;
  return addPatientFlag(
    state,
    call.patientId,
    call.target?.kind === 'RANK' ? 'senior.advised' : 'dept.advised',
  );
}

function etaText(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} 分鐘`;
}

function denyTermsOf(state: GameState, patientId: string, ctx: EngineContext): string[] {
  const patient = state.patients[patientId];
  const template = ctx.tables['case-templates'].find(
    (c) => c.id === patient?.hidden.caseTemplateId,
  );
  return template ? [...template.diagnosisTerms] : [];
}

type ConsultBeat =
  | {
      type: 'OUTCOME';
      outcome: string;
      attitude: string | null;
      etaToken: string | null;
      changed: boolean;
    }
  | { type: 'ASK_MISSING'; items: { id: string; description: string }[] };

function replyFor(
  state: GameState,
  call: Call,
  decision: { outcome: string; arrivalDelay: number | null; attitude: Decision['attitude'] },
  asks: string[],
  changed: boolean,
  doctorSaid: string,
  ctx: EngineContext,
): { state: GameState; effect: Effect; reqId: string } | undefined {
  const patient = call.patientId ? state.patients[call.patientId] : undefined;
  if (!patient) return undefined;
  const hasEta = decision.arrivalDelay !== null && decision.outcome !== 'ICU_ASSESS';
  const tokens: Record<string, string> = {
    ...patientTokens(patient),
    'callee.label': call.callerName,
    ...(hasEta && decision.arrivalDelay !== null
      ? { 'consult.eta': etaText(decision.arrivalDelay) }
      : {}),
  };
  const descriptions = new Map(ctx.config.consult.items.map((i) => [i.id, i.description] as const));
  const beats: ConsultBeat[] = [
    {
      type: 'OUTCOME',
      outcome: decision.outcome,
      attitude: decision.attitude,
      etaToken: hasEta ? 'consult.eta' : null,
      changed,
    },
  ];
  if (asks.length > 0) {
    beats.push({
      type: 'ASK_MISSING',
      items: asks.map((id) => ({ id, description: descriptions.get(id) ?? id })),
    });
  }
  const input: ReplyInput = {
    kind: CONSULT_REPLY_KIND,
    call,
    callee: {
      name: call.callerName,
      kind: call.target?.kind ?? 'RANK',
      rank: call.callerRank,
      attitude: decision.attitude,
    },
    beats,
    doctorSaid,
    tokens,
    denyTerms: denyTermsOf(state, patient.id, ctx),
  };
  return requestCalleeReply(state, input, ctx);
}

function withReply(
  call: Call,
  consult: ConsultExchange,
  outcome: string,
  reply: { state: GameState; effect: Effect; reqId: string },
): Reduction {
  const updated: Call = {
    ...call,
    outcome,
    exchange: { phase: 'AWAITING_REPLY', reqId: reply.reqId, consult, family: null },
  };
  return { state: putCall(reply.state, updated), effects: [reply.effect] };
}

function resolveInitial(
  state: GameState,
  callId: string,
  assessment: Assessment,
  vitalsRef: VitalsRef,
  ctx: EngineContext,
): Reduction {
  const call = findCall(state, callId);
  if (!call?.target || !call.patientId) return { state, effects: [] };
  const { patientId, target } = call;
  const inaccurate = isInaccurate(ctx, state, patientId, vitalsRef, assessment.quoted);
  const clarity = clarityOf(ctx, assessment.covered, inaccurate);
  const decision = decide(state, call, clarity, ctx);
  const effects: Effect[] = [];
  const ruleTargets = {
    callee: decision.calleeRank,
    callId,
    patientId,
    evidence: `call:${callId}`,
    facts: { clarity },
  };

  let next = state;
  let ruleApplied: ConsultExchange['ruleApplied'] = null;
  if (clarity >= 3) {
    next = applyRule(next, target.kind === 'RANK' ? 'SBAR_GOOD' : 'CONSULT_GOOD', ctx, ruleTargets);
    ruleApplied = 'GOOD';
  } else if (clarity <= 1) {
    next = applyRule(next, target.kind === 'RANK' ? 'SBAR_POOR' : 'CONSULT_POOR', ctx, ruleTargets);
    ruleApplied = 'POOR';
  }
  if (inaccurate) next = applyRule(next, 'SBAR_INACCURATE', ctx, ruleTargets);
  if (assessment.tone === 'RUDE') next = applyRule(next, 'SBAR_RUDE', ctx, ruleTargets);
  next = flagAdvice(next, call, decision.outcome);
  next = applyArrival(next, call, decision);
  if (decision.outcome === 'REFUSE') effects.push(notice('CONSULT_REFUSED'));

  const asks = askedItems(ctx, assessment.covered, decision.questionDepth, 0);
  const consult: ConsultExchange = {
    covered: assessment.covered,
    clarity,
    inaccurate,
    tone: assessment.tone,
    asks,
    followups: 0,
    ruleApplied,
    vitalsRef,
  };
  const said = PARTS.map((part) => `${part}: ${call.sbar?.[part] ?? ''}`).join('\n');
  const reply = replyFor(next, call, decision, asks, false, said, ctx);
  if (!reply) return { state: next, effects };
  const result = withReply(call, consult, decision.outcome, reply);
  return { state: result.state, effects: [...effects, ...result.effects] };
}

function resolveFollowup(
  state: GameState,
  callId: string,
  assessment: Assessment,
  ctx: EngineContext,
): Reduction {
  const call = findCall(state, callId);
  const previous = call?.exchange?.consult;
  if (!call?.target || !call.patientId || !previous) return { state, effects: [] };
  const { patientId, target } = call;
  const covered = [...new Set([...previous.covered, ...assessment.covered])];
  const inaccurate =
    previous.inaccurate ||
    isInaccurate(ctx, state, patientId, previous.vitalsRef, assessment.quoted);
  const clarity = clarityOf(ctx, covered, inaccurate);
  const decision = decide(state, call, clarity, ctx);
  const ruleTargets = {
    callee: decision.calleeRank,
    callId,
    patientId,
    evidence: `call:${callId}`,
    facts: { clarity },
  };

  let next = state;
  if (inaccurate && !previous.inaccurate)
    next = applyRule(next, 'SBAR_INACCURATE', ctx, ruleTargets);
  if (assessment.tone === 'RUDE' && previous.tone !== 'RUDE') {
    next = applyRule(next, 'SBAR_RUDE', ctx, ruleTargets);
  }
  let ruleApplied = previous.ruleApplied;
  if (clarity >= 3 && ruleApplied !== 'GOOD') {
    next = applyRule(next, target.kind === 'RANK' ? 'SBAR_GOOD' : 'CONSULT_GOOD', ctx, ruleTargets);
    ruleApplied = 'GOOD';
  }

  const currentOutcome = call.outcome ?? 'REFUSE';
  const upgraded = (OUTCOME_LEVEL[decision.outcome] ?? 0) > (OUTCOME_LEVEL[currentOutcome] ?? 0);
  const outcome = upgraded ? decision.outcome : currentOutcome;
  if (upgraded) {
    next = flagAdvice(next, call, outcome);
    next = applyArrival(next, call, decision);
  }
  const followups = previous.followups + 1;
  const asks = askedItems(ctx, covered, decision.questionDepth, followups);
  const consult: ConsultExchange = {
    ...previous,
    covered,
    clarity,
    inaccurate,
    tone: assessment.tone === 'RUDE' ? 'RUDE' : previous.tone,
    asks,
    followups,
    ruleApplied,
  };
  const arrival = upgraded ? decision.arrivalDelay : null;
  const reply = replyFor(
    next,
    call,
    { outcome, arrivalDelay: arrival, attitude: decision.attitude },
    asks,
    upgraded,
    call.lines.filter((l) => l.speaker === 'PLAYER').at(-1)?.template ?? '',
    ctx,
  );
  if (!reply) return { state: next, effects: [] };
  return withReply(call, consult, outcome, reply);
}

// ---------- 玩家跟進／掛線 ----------

export function sendFollowup(
  state: GameState,
  callId: string,
  rawText: string,
  ctx: EngineContext,
): Reduction {
  const call = findCall(state, callId);
  const consult = call?.exchange?.consult;
  if (call?.direction !== 'OUT' || !call.target || !consult) {
    return { state, effects: [notice('CALL_UNKNOWN')] };
  }
  if (call.exchange?.phase !== 'OPEN') return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  const text = rawText.trim();
  if (text.length === 0) return { state, effects: [notice('CHAT_EMPTY')] };
  if (text.length > ctx.config.consult.followupMaxChars) {
    return { state, effects: [notice('CHAT_TOO_LONG')] };
  }
  const line: CallLine = {
    t: state.clock.t,
    speaker: 'PLAYER',
    name: '',
    template: playerTemplate(text),
    tokenValues: {},
  };
  const withLine: Call = { ...call, lines: [...call.lines, line] };
  const requested = requestAssess(
    putCall(state, withLine),
    withLine,
    {
      mode: 'FOLLOWUP',
      sbar: { S: '', B: '', A: '', R: '' },
      followup: text,
      asked: consult.asks,
      vitalsRef: consult.vitalsRef,
    },
    ctx,
  );
  return { state: requested.state, effects: [requested.effect] };
}

export function endCall(state: GameState, callId: string): Reduction {
  const call = findCall(state, callId);
  if (call?.direction !== 'OUT' || !call.exchange) {
    return { state, effects: [notice('CALL_UNKNOWN')] };
  }
  if (call.exchange.phase !== 'OPEN') return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  const exchange: Exchange = { ...call.exchange, phase: 'CLOSED', reqId: null };
  return { state: putCall(state, { ...call, exchange }), effects: [] };
}

// ---------- consult.reply：結果 ----------

export function handleConsultReplyResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const applied = applyCalleeLines(state, pending, payload, ctx);
  if (applied.kind === 'reject') return rejectAiResult(state, pending);
  if (applied.kind === 'stale') return { state, effects: [] };
  const { call } = applied;
  const consult = call.exchange?.consult ?? null;
  const open = consult !== null && consult.asks.length > 0;
  const exchange: Exchange = {
    phase: open ? 'OPEN' : 'CLOSED',
    reqId: null,
    consult,
    family: null,
  };
  return { state: putCall(applied.state, { ...call, exchange }), effects: [] };
}

// ---------- 被叫方到達床邊（或 ICU 評估完成） ----------

export function handleConsultArrival(
  state: GameState,
  callId: string,
  ctx: EngineContext,
): Reduction {
  const call = findCall(state, callId);
  if (call?.direction !== 'OUT' || !call.patientId || !call.target) return { state, effects: [] };
  const patient = state.patients[call.patientId];
  if (!patient) return { state, effects: [] };
  const t = state.clock.t;
  let outcome = call.outcome ?? 'BEDSIDE';
  let next = state;
  if (outcome === 'ICU_ASSESS') {
    const dept = call.deptId ? deptOf(ctx, call.deptId) : undefined;
    const mewsMin = dept?.icu?.mewsMin ?? Number.POSITIVE_INFINITY;
    outcome = patient.visible.mews.score >= mewsMin ? 'ICU_ACCEPT' : 'ICU_DECLINE';
    if (outcome === 'ICU_ACCEPT') next = addPatientFlag(next, patient.id, 'icu.accepted');
  } else if (call.target.kind === 'RANK') {
    next = addPatientFlag(next, patient.id, 'senior.reviewed');
  } else {
    next = addPatientFlag(next, patient.id, 'dept.reviewed');
  }
  next = putCall(next, {
    ...call,
    outcome,
    lines: [
      ...call.lines,
      {
        t,
        speaker: 'CALLEE',
        name: call.callerName,
        template: `@ARRIVED_${outcome}`,
        tokenValues: {},
      },
    ],
  });
  return { state: next, effects: [notice('CONSULT_ARRIVED', 'info')] };
}
