import { isWardPatientActive } from './departure';
/**
 * 共用電話（S-7 A）：護士／低階醫生／其他部門來電、三種回應、步步上報同 SBAR、其他專科會診。
 * 所有結果由 T17／T18／T22／T24 表驅動；對白只係 engine 凍結嘅模板＋token，冇 AI 數字。
 */
import { patientTokens, vitalTokens } from '../chat/dialogue';
import { renderTemplate } from '../chat/tokens';
import { createPatientState } from '../case/caseModule';
import type { CallResponseEffect, CallTemplateRow, CaseTemplateRow } from '../case/tables';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import {
  callTemplates,
  CALL_EXPIRE_EVENT,
  CALL_RING_AGAIN_EVENT,
  findCall,
  notice,
  putCall,
  responsesOf,
  scheduleCallEvent,
} from './callStore';
import { logIncomingCall } from './callLog';
import { interrupt } from './pharmacyCall';
import { bedsOf } from './generate';
import { addPatientFlag, moveTo, patientAtBed } from './movement';
import { nurseForBed } from './nurses';
import { RngCursor } from './rngCursor';
import { applyRule } from '../score/scoring';
import { buildChat } from './generateChat';
import { type Call, type CallLine, type CallResponse, type Rank } from './wardTypes';

export {
  CALL_EVENT_PRIORITY,
  CALL_EXPIRE_EVENT,
  CALL_RING_AGAIN_EVENT,
  CONSULT_ARRIVAL_EVENT,
  callTemplates,
  findCall,
} from './callStore';

const schedule = scheduleCallEvent;

/** 玩家已經企喺呢個病人張床，護士同駐院醫生唔使再打電話。 */
function atThisBedside(state: GameState, patientId: string | null): boolean {
  if (!patientId) return false;
  const bed = state.patients[patientId]?.bed;
  return bed !== undefined && state.ward.location.bed === bed;
}

function bedsideCaller(tag: CallTemplateRow['tag']): boolean {
  return tag === 'NURSE' || tag === 'JUNIOR';
}

function worstPatientId(state: GameState): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const patient of Object.values(state.patients)) {
    if (!isWardPatientActive(patient)) continue;
    if (patient.visible.mews.score > bestScore) {
      best = patient.id;
      bestScore = patient.visible.mews.score;
    }
  }
  return best;
}

function patientsWithAbnormalReport(state: GameState): string[] {
  return Object.values(state.patients)
    .filter((p) => isWardPatientActive(p) && p.visible.reports.some((r) => r.abnormal))
    .map((p) => p.id);
}

function templateEligible(state: GameState, row: CallTemplateRow, ctx: EngineContext): boolean {
  if (!row.playerRanks.includes(state.playerRank)) return false;
  if (row.tag === 'JUNIOR' && !state.ward.sub) return false;
  const hasPatients = Object.values(state.patients).some(isWardPatientActive);
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
  const eligible = all.filter(
    (t) => t.wards.includes(state.ward.code) && t.complexity !== 'SCENARIO',
  );
  const pool: CaseTemplateRow[] = eligible.filter(
    (t) => !used.has(t.id) && t.complexity === 'COMPLEX',
  );
  const fallback = eligible.filter((t) => !used.has(t.id));
  const choices = pool.length > 0 ? pool : fallback.length > 0 ? fallback : [...eligible];
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
      const here = next.ward.location.bed;
      const ids = Object.keys(next.patients)
        .filter((id) => {
          const p = next.patients[id];
          return p && isWardPatientActive(p) && (!bedsideCaller(row.tag) || p.bed !== here);
        })
        .sort();
      patientId = ids.length > 0 ? (ids[cursor.int('calls', 0, ids.length)] ?? null) : null;
      break;
    }
    case 'WORST_PATIENT': {
      const id = worstPatientId(next);
      patientId = bedsideCaller(row.tag) && atThisBedside(next, id) ? null : id;
      break;
    }
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
  // 隨機藥房來電同 drug chart 覆核唔再出現。RNG 照用，等其他來電的次序不變。
  // 藥物同點滴的核對由玩家落單之後的把關開出。
  if (row.id === 'PHARMACY_QUERY' || row.id === 'NURSE_DRUGCHART') {
    return { state: { ...next, rng: cursor.rng }, effects: [] };
  }

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
    purpose: 'GENERAL',
    exchange: null,
  };
  next = {
    ...next,
    rng: cursor.rng,
    ward: { ...next.ward, counters: { ...next.ward.counters, call: next.ward.counters.call + 1 } },
  };
  next = putCall(next, call);
  next = logIncomingCall(next, call);
  next = schedule(next, expiresAt, CALL_EXPIRE_EVENT, { callId: id });
  next = interrupt(next, row.priority, ctx);
  return { state: next, effects: [notice('CALL_RINGING', 'info')] };
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
      evidence: `call:${call.id}`,
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
  const responses = responsesOf(ctx, call.templateId);
  if (!responses) return { state, effects: [] };
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
    let next = applyResponseEffect(state, call, responses.LATER, ctx);
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

  const effect = responses[response];
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
  const responses = responsesOf(ctx, call.templateId);
  let next = state;
  if (responses) next = applyResponseEffect(next, call, responses.MISSED, ctx);
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
  if ((call.tag === 'NURSE' || call.tag === 'JUNIOR') && atThisBedside(state, call.patientId)) {
    return {
      state: putCall(state, {
        ...call,
        status: 'DONE',
        resolution: 'ATTENDED',
        ringAgainAt: null,
      }),
      effects: [],
    };
  }
  const next = interrupt(
    putCall(state, { ...call, status: 'RINGING', ringAgainAt: null }),
    call.priority,
    ctx,
  );
  return { state: next, effects: [notice('CALL_RINGING', 'info')] };
}
