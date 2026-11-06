/**
 * 共用電話（S-7 A）：護士／低階醫生／其他部門來電、三種回應、步步上報同 SBAR、其他專科會診。
 * 所有結果由 T17／T18／T22／T24 表驅動；對白只係 engine 凍結嘅模板＋token，冇 AI 數字。
 */
import { patientTokens, vitalTokens } from '../chat/dialogue';
import { renderTemplate } from '../chat/tokens';
import { createPatientState } from '../case/caseModule';
import type {
  CallResponseEffect,
  CallTemplateRow,
  CaseTemplateRow,
  ConsultDepartmentRow,
  Priority,
} from '../case/tables';
import { enqueue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { bedsOf } from './generate';
import { addPatientFlag, moveTo, patientAtBed } from './movement';
import { nurseForBed } from './nurses';
import { RngCursor } from './rngCursor';
import { sbarClarity } from './sbar';
import { applyRule, impressionBand, impressionOf } from './scoring';
import { buildChat } from './generateChat';
import {
  RANKS,
  type Call,
  type CallLine,
  type CallResponse,
  type CallTarget,
  type Rank,
  type Sbar,
} from './wardTypes';

export const CALL_EXPIRE_EVENT = 'CALL_EXPIRE';
export const CALL_RING_AGAIN_EVENT = 'CALL_RING_AGAIN';
export const CONSULT_ARRIVAL_EVENT = 'CONSULT_ARRIVAL';
export const CALL_EVENT_PRIORITY = 20;

const notice = (
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
  tone: 'info' | 'warn' = 'warn',
): Effect => ({
  type: 'NOTICE',
  kind,
  tone,
});

export function callTemplates(ctx: EngineContext): CallTemplateRow[] {
  return ctx.tables['call-templates'].filter((r): r is CallTemplateRow => r.kind === 'CALL');
}

function putCall(state: GameState, call: Call): GameState {
  const exists = state.ward.calls.some((c) => c.id === call.id);
  return {
    ...state,
    ward: {
      ...state.ward,
      calls: exists
        ? state.ward.calls.map((c) => (c.id === call.id ? call : c))
        : [...state.ward.calls, call],
    },
  };
}

export function findCall(state: GameState, callId: string): Call | undefined {
  return state.ward.calls.find((c) => c.id === callId);
}

function schedule(state: GameState, time: number, kind: string, payload: Record<string, string>) {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, { time, priority: CALL_EVENT_PRIORITY, kind, payload }),
  };
}

function worstPatientId(state: GameState): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const patient of Object.values(state.patients)) {
    if (patient.visible.mews.score > bestScore) {
      best = patient.id;
      bestScore = patient.visible.mews.score;
    }
  }
  return best;
}

function patientsWithAbnormalReport(state: GameState): string[] {
  return Object.values(state.patients)
    .filter((p) => p.visible.reports.some((r) => r.abnormal))
    .map((p) => p.id);
}

function templateEligible(state: GameState, row: CallTemplateRow, ctx: EngineContext): boolean {
  if (!row.playerRanks.includes(state.playerRank)) return false;
  if (row.tag === 'JUNIOR' && !state.ward.sub) return false;
  const hasPatients = Object.keys(state.patients).length > 0;
  switch (row.needs) {
    case 'NONE':
      return true;
    case 'ANY_PATIENT':
    case 'WORST_PATIENT':
      return hasPatients;
    case 'ABNORMAL_REPORT':
      return patientsWithAbnormalReport(state).length > 0;
    case 'FREE_BED':
      return freeBeds(state, ctx).length > 0;
  }
}

function freeBeds(state: GameState, ctx: EngineContext): number[] {
  return bedsOf(ctx).filter((bed) => patientAtBed(state, bed) === null);
}

function admitNewPatient(
  state: GameState,
  ctx: EngineContext,
  cursor: RngCursor,
): { state: GameState; patientId: string } | undefined {
  const beds = freeBeds(state, ctx);
  if (beds.length === 0) return undefined;
  const bed = beds[cursor.int('calls', 0, beds.length)];
  if (bed === undefined) return undefined;
  const used = new Set(Object.values(state.patients).map((p) => p.hidden.caseTemplateId));
  const all = ctx.tables['case-templates'];
  const pool: CaseTemplateRow[] = all.filter((t) => !used.has(t.id) && t.complexity === 'COMPLEX');
  const fallback = all.filter((t) => !used.has(t.id));
  const choices = pool.length > 0 ? pool : fallback.length > 0 ? fallback : [...all];
  const template = choices[cursor.int('calls', 0, choices.length)];
  if (!template) return undefined;
  const index =
    Math.max(0, ...Object.keys(state.patients).map((id) => Number(id.replace(/^p/, '')) || 0)) + 1;
  const id = `p${String(index)}`;
  let next = createPatientState(state, template, ctx, { id, bed, logStart: false });
  const patient = next.patients[id];
  if (!patient) return undefined;
  next = {
    ...next,
    chats: { ...next.chats, [id]: buildChat(next, patient, ctx) },
    ward: { ...next.ward, tags: { ...next.ward.tags, [id]: ['ED_ADMISSION'] } },
  };
  return { state: next, patientId: id };
}

function callerRankOf(playerRank: string): Rank | null {
  return playerRank === 'MO' ? 'HO' : playerRank === 'RES' ? 'MO' : null;
}

export function handleCallArrival(state: GameState, ctx: EngineContext): Reduction {
  const eligible = callTemplates(ctx).filter((row) => templateEligible(state, row, ctx));
  const cursor = new RngCursor(state.rng);
  const row = cursor.weighted('calls', eligible, (r) => r.weight);
  if (!row) return { state, effects: [] };

  let next: GameState = state;
  let patientId: string | null = null;
  switch (row.needs) {
    case 'ANY_PATIENT': {
      const ids = Object.keys(next.patients).sort();
      patientId = ids[cursor.int('calls', 0, ids.length)] ?? null;
      break;
    }
    case 'WORST_PATIENT':
      patientId = worstPatientId(next);
      break;
    case 'ABNORMAL_REPORT': {
      const ids = patientsWithAbnormalReport(next).sort();
      patientId = ids[cursor.int('calls', 0, ids.length)] ?? null;
      break;
    }
    case 'FREE_BED': {
      const admitted = admitNewPatient({ ...next, rng: cursor.rng }, ctx, cursor);
      if (admitted) {
        next = admitted.state;
        cursor.rng = next.rng;
        patientId = admitted.patientId;
      }
      break;
    }
    case 'NONE':
      break;
  }
  if (row.needs !== 'NONE' && patientId === null)
    return { state: { ...next, rng: cursor.rng }, effects: [] };

  const patient = patientId ? next.patients[patientId] : undefined;
  const deptPool = row.deptPool ?? [];
  const deptId =
    row.tag === 'DEPT'
      ? (deptPool[cursor.int('calls', 0, Math.max(1, deptPool.length))] ?? null)
      : null;
  const dept = deptId ? ctx.tables['consult-departments'].find((d) => d.id === deptId) : undefined;

  let callerName = '';
  let callerRank: Rank | null = null;
  if (row.tag === 'NURSE' && patient) callerName = nurseForBed(next, ctx, patient.bed)?.name ?? '';
  if (row.tag === 'JUNIOR') {
    callerName = next.ward.sub?.name ?? '';
    callerRank = callerRankOf(next.playerRank);
  }
  if (row.tag === 'PHARMACY') callerName = ctx.config.gate.pharmacyName;
  if (row.tag === 'DEPT') callerName = dept?.label ?? '';

  const reportLabel = patient?.visible.reports.filter((r) => r.abnormal).at(-1)?.label ?? '';
  const tokenValues: Record<string, string> = {
    ...(patient ? { ...vitalTokens(patient, ctx.tables), ...patientTokens(patient) } : {}),
    'caller.name': callerName,
    'dept.label': dept?.label ?? '',
    'report.label': reportLabel,
  };

  const id = `k${String(next.ward.counters.call + 1)}`;
  const t = next.clock.t;
  const expiresAt = t + ctx.config.phone.expireSec[row.priority];
  const line: CallLine = {
    t,
    speaker: 'CALLER',
    name: callerName,
    template: row.text,
    tokenValues,
  };
  const call: Call = {
    id,
    templateId: row.id,
    direction: 'IN',
    tag: row.tag,
    priority: row.priority,
    callerName,
    callerRank,
    patientId,
    deptId,
    target: null,
    status: 'RINGING',
    resolution: null,
    arrivedAt: t,
    expiresAt,
    ringAgainAt: null,
    defers: 0,
    delegable: row.delegable,
    sbar: row.sbar
      ? {
          S: renderTemplate(row.sbar.S, tokenValues),
          B: renderTemplate(row.sbar.B, tokenValues),
          A: renderTemplate(row.sbar.A, tokenValues),
          R: renderTemplate(row.sbar.R, tokenValues),
        }
      : null,
    outcome: null,
    lines: [line],
  };
  next = {
    ...next,
    rng: cursor.rng,
    ward: { ...next.ward, counters: { ...next.ward.counters, call: next.ward.counters.call + 1 } },
  };
  next = putCall(next, call);
  next = schedule(next, expiresAt, CALL_EXPIRE_EVENT, { callId: id });
  next = interrupt(next, row.priority, ctx);
  return { state: next, effects: [notice('CALL_RINGING', 'info')] };
}

function interrupt(state: GameState, priority: Priority, ctx: EngineContext): GameState {
  if (!ctx.config.phone.interruptPriorities.includes(priority)) return state;
  if (state.clock.cprSlow || state.clock.speed <= ctx.config.clock.speedAfterInterrupt)
    return state;
  return { ...state, clock: { ...state.clock, speed: ctx.config.clock.speedAfterInterrupt } };
}

function applyResponseEffect(
  state: GameState,
  call: Call,
  effect: CallResponseEffect,
  ctx: EngineContext,
): GameState {
  let next = state;
  for (const ruleId of effect.events) {
    next = applyRule(next, ruleId, ctx, {
      callId: call.id,
      patientId: call.patientId,
      caller: call.callerRank,
    });
  }
  if (call.patientId) {
    for (const flag of effect.setFlags) next = addPatientFlag(next, call.patientId, flag);
  }
  return next;
}

export function respondToCall(
  state: GameState,
  callId: string,
  response: CallResponse,
  ctx: EngineContext,
): Reduction {
  const call = findCall(state, callId);
  if (call?.direction !== 'IN') {
    return { state, effects: [notice('CALL_UNKNOWN')] };
  }
  if (call.status !== 'RINGING' && call.status !== 'DEFERRED') {
    return { state, effects: [notice('CALL_NOT_ACTIVE')] };
  }
  const row = callTemplates(ctx).find((r) => r.id === call.templateId);
  if (!row) return { state, effects: [] };
  const t = state.clock.t;
  const playerLine: CallLine = {
    t,
    speaker: 'PLAYER',
    name: '',
    template: `@REPLY_${response}`,
    tokenValues: {},
  };

  if (response === 'LATER') {
    const defers = call.defers + 1;
    if (defers > ctx.config.phone.maxDefers) {
      return missCall(state, { ...call, lines: [...call.lines, playerLine] }, ctx);
    }
    const ringAgainAt = t + ctx.config.phone.laterDelaySec;
    let next = applyResponseEffect(state, call, row.responses.LATER, ctx);
    next = putCall(next, {
      ...call,
      status: 'DEFERRED',
      defers,
      ringAgainAt,
      resolution: 'LATER',
      lines: [...call.lines, playerLine],
    });
    next = schedule(next, ringAgainAt, CALL_RING_AGAIN_EVENT, { callId });
    return { state: next, effects: [] };
  }

  const effect = row.responses[response];
  let next = applyResponseEffect(state, call, effect, ctx);
  next = putCall(next, {
    ...call,
    status: 'DONE',
    resolution: response,
    ringAgainAt: null,
    lines: [...call.lines, playerLine],
  });
  if (effect.goToBed && call.patientId) {
    const patient = next.patients[call.patientId];
    if (patient) return moveTo(next, patient.bed, ctx);
  }
  return { state: next, effects: [] };
}

export function missCall(state: GameState, call: Call, ctx: EngineContext): Reduction {
  const row = callTemplates(ctx).find((r) => r.id === call.templateId);
  let next = state;
  if (row) next = applyResponseEffect(next, call, row.responses.MISSED, ctx);
  next = putCall(next, {
    ...call,
    status: 'MISSED',
    resolution: 'MISSED',
    ringAgainAt: null,
    lines: [
      ...call.lines,
      {
        t: state.clock.t,
        speaker: 'CALLER',
        name: call.callerName,
        template: '@MISSED',
        tokenValues: {},
      },
    ],
  });
  return { state: next, effects: [notice('CALL_MISSED')] };
}

export function handleCallExpire(state: GameState, callId: string, ctx: EngineContext): Reduction {
  const call = findCall(state, callId);
  if (call?.direction !== 'IN') return { state, effects: [] };
  if (call.status !== 'RINGING' && call.status !== 'DEFERRED') return { state, effects: [] };
  return missCall(state, call, ctx);
}

export function handleRingAgain(state: GameState, callId: string, ctx: EngineContext): Reduction {
  const call = findCall(state, callId);
  if (call?.status !== 'DEFERRED') return { state, effects: [] };
  const next = interrupt(
    putCall(state, { ...call, status: 'RINGING', ringAgainAt: null }),
    call.priority,
    ctx,
  );
  return { state: next, effects: [notice('CALL_RINGING', 'info')] };
}

// ---------- 上報（步步上報＋SBAR）同會診 ----------

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

export function sendEscalation(state: GameState, sbar: Sbar, ctx: EngineContext): Reduction {
  const draft = state.ward.draft;
  if (!draft) return { state, effects: [notice('SBAR_INVALID')] };
  const max = ctx.config.phone.sbarMaxChars;
  if ([sbar.S, sbar.B, sbar.A, sbar.R].some((part) => part.length > max)) {
    return { state, effects: [notice('SBAR_INVALID')] };
  }
  const { patientId, target } = draft;
  const patient = state.patients[patientId];
  if (!patient || !targetValid(state, target, ctx)) {
    return { state, effects: [notice('CALL_TARGET_INVALID')] };
  }

  const t = state.clock.t;
  const clarity = sbarClarity(sbar);
  const id = `k${String(state.ward.counters.call + 1)}`;
  let next: GameState = {
    ...state,
    ward: {
      ...state.ward,
      draft: null,
      counters: { ...state.ward.counters, call: state.ward.counters.call + 1 },
    },
  };
  const lines: CallLine[] = (['S', 'B', 'A', 'R'] as const).map((key) => ({
    t,
    speaker: 'PLAYER',
    name: key,
    template: sbar[key],
    tokenValues: {},
  }));
  const effects: Effect[] = [];
  let outcome: string;
  let calleeName = '';
  let calleeRank: Rank | null = null;
  let arrivalDelay: number | null = null;

  if (target.kind === 'RANK') {
    calleeRank = target.rank;
    calleeName = target.rank;
    const skipped = skippedRanks(next, patientId, target.rank);
    next = applyRule(
      next,
      skipped.length > 0 ? 'ESCALATION_SKIPPED_LEVEL' : 'ESCALATION_STEP_OK',
      ctx,
      { skipped, callId: id, patientId },
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
    const behaviour = ctx.tables['rank-behaviour'].find((r) => r.id === target.rank);
    const band = impressionBand(impressionOf(next, target.rank, ctx), ctx);
    const rule = behaviour?.bands[band];
    if (!rule) {
      outcome = 'REFUSE';
    } else if (clarity >= rule.bedsideMinClarity) {
      outcome = 'BEDSIDE';
      arrivalDelay = rule.reactionSec;
    } else if (clarity >= rule.adviceMinClarity) {
      outcome = 'ADVICE';
    } else {
      outcome = 'REFUSE';
    }
  } else {
    const dept = deptOf(ctx, target.deptId);
    calleeName = dept?.label ?? '';
    if (!dept || clarity < dept.acceptMinClarity) {
      outcome = 'REFUSE';
    } else if (dept.kind === 'ICU' && dept.icu) {
      outcome = 'ICU_ASSESS';
      arrivalDelay = dept.icu.assessSec;
    } else {
      const urgency = urgencyOf(next, patientId, ctx);
      if (dept.bedsideByUrgency[urgency] === 'BEDSIDE') {
        outcome = 'BEDSIDE';
        arrivalDelay = dept.reactionSec.BEDSIDE;
      } else {
        outcome = 'ADVICE';
      }
    }
  }

  if (clarity >= 3) {
    next = applyRule(next, target.kind === 'RANK' ? 'SBAR_GOOD' : 'CONSULT_GOOD', ctx, {
      callee: calleeRank,
      callId: id,
      patientId,
    });
  } else if (clarity <= 1) {
    next = applyRule(next, target.kind === 'RANK' ? 'SBAR_POOR' : 'CONSULT_POOR', ctx, {
      callee: calleeRank,
      callId: id,
      patientId,
    });
  }
  if (outcome === 'ADVICE' && target.kind === 'RANK') {
    next = addPatientFlag(next, patientId, 'senior.advised');
  } else if (outcome === 'ADVICE') {
    next = addPatientFlag(next, patientId, 'dept.advised');
  }
  if (outcome === 'REFUSE') effects.push(notice('CONSULT_REFUSED'));

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
    outcome,
    lines: [
      ...lines,
      { t, speaker: 'CALLEE', name: calleeName, template: `@CALLEE_${outcome}`, tokenValues: {} },
    ],
  };
  next = putCall(next, call);
  if (arrivalDelay !== null) {
    next = schedule(next, t + arrivalDelay, CONSULT_ARRIVAL_EVENT, { callId: id });
  }
  return { state: next, effects };
}

/** 被叫方到達床邊（或 ICU 評估完成） */
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
