/** 玩家喺病房入面嘅位置同行走（T28：同區即時，跨區要時間） */
import { buildPresent } from '../bedside/bedside';
import { appendLine } from '../chat/dialogue';
import { enqueue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { resolveArrestCallsAtBed } from './arrestCall';
import { zoneOfBed } from './nurses';

export const PLAYER_ARRIVE_EVENT = 'PLAYER_ARRIVE';
export const PLAYER_ARRIVE_PRIORITY = 5;

export function patientAtBed(state: GameState, bed: number): string | null {
  for (const patient of Object.values(state.patients)) if (patient.bed === bed) return patient.id;
  return null;
}

export function addPatientFlag(state: GameState, patientId: string, flag: string): GameState {
  const patient = state.patients[patientId];
  if (!patient || patient.hidden.fsm.flags.includes(flag)) return state;
  return {
    ...state,
    patients: {
      ...state.patients,
      [patientId]: {
        ...patient,
        hidden: {
          ...patient.hidden,
          fsm: { ...patient.hidden.fsm, flags: [...patient.hidden.fsm.flags, flag] },
        },
      },
    },
  };
}

function leaveVisit(state: GameState, patientId: string): GameState {
  const thread = state.chats[patientId];
  const last = thread?.visits.at(-1);
  if (!thread || last?.leftAt !== null) return state;
  const visits = [
    ...thread.visits.slice(0, -1),
    { ...last, leftAt: state.clock.t, lineCountAtLeave: thread.lines.length },
  ];
  return { ...state, chats: { ...state.chats, [patientId]: { ...thread, visits } } };
}

function enterVisit(state: GameState, patientId: string, ctx: EngineContext): GameState {
  const patient = state.patients[patientId];
  const thread = state.chats[patientId];
  if (!patient || !thread) return state;
  const last = thread.visits.at(-1);
  if (last?.leftAt === null) return state;
  const refreshed = {
    ...thread,
    present: buildPresent(state, patient, ctx),
    visits: [
      ...thread.visits,
      {
        enteredAt: state.clock.t,
        leftAt: null,
        lineCountAtEnter: thread.lines.length,
        lineCountAtLeave: null,
      },
    ],
  };
  const next: GameState = { ...state, chats: { ...state.chats, [patientId]: refreshed } };
  const nurse = refreshed.present.find((p) => p.kind === 'NURSE');
  return nurse
    ? appendLine(next, {
        t: next.clock.t,
        patientId,
        speaker: { kind: 'SYSTEM', id: nurse.id },
        template: 'ARRIVE',
        tokenValues: {},
        orderId: null,
      })
    : next;
}

export function arriveAt(state: GameState, bed: number | null, ctx: EngineContext): GameState {
  let next: GameState = {
    ...state,
    ward: { ...state.ward, location: { bed, movingTo: null, arriveAt: null } },
  };
  if (bed === null) return next;
  const patientId = patientAtBed(next, bed);
  if (!patientId) return next;
  next = enterVisit(resolveArrestCallsAtBed(next, patientId), patientId, ctx);
  const tags = next.ward.tags[patientId];
  if (tags?.includes('ED_ADMISSION')) {
    next = {
      ...next,
      ward: {
        ...next.ward,
        tags: { ...next.ward.tags, [patientId]: tags.filter((t) => t !== 'ED_ADMISSION') },
      },
    };
  }
  return next;
}

/** 移去指定床（或 null＝護士站）。同區即時到；跨區排程到達事件 */
export function moveTo(state: GameState, bed: number | null, ctx: EngineContext): Reduction {
  const { location } = state.ward;
  if (location.movingTo !== null) {
    return { state, effects: [{ type: 'NOTICE', kind: 'PLAYER_MOVING', tone: 'warn' }] };
  }
  if (location.bed === bed) return { state, effects: [] };
  let next = state;
  if (location.bed !== null) {
    const here = patientAtBed(next, location.bed);
    if (here) next = leaveVisit(next, here);
  }
  const layout = ctx.tables['ward-layout'].find((r) => r.kind === 'WALK');
  const crossSec = layout?.kind === 'WALK' ? layout.crossZoneSec : 0;
  const sameSec = layout?.kind === 'WALK' ? layout.sameZoneSec : 0;
  let walkSec = 0;
  if (location.bed !== null && bed !== null) {
    walkSec = zoneOfBed(ctx, location.bed) === zoneOfBed(ctx, bed) ? sameSec : crossSec;
  } else if (location.bed !== null && bed === null) {
    walkSec = sameSec;
  }
  if (walkSec <= 0) return { state: arriveAt(next, bed, ctx), effects: [] };
  const arriveTime = next.clock.t + walkSec;
  return {
    state: {
      ...next,
      ward: {
        ...next.ward,
        location: { bed: null, movingTo: bed ?? 0, arriveAt: arriveTime },
      },
      scheduler: enqueue(next.scheduler, {
        time: arriveTime,
        priority: PLAYER_ARRIVE_PRIORITY,
        kind: PLAYER_ARRIVE_EVENT,
        payload: { bed },
      }),
    },
    effects: [],
  };
}
