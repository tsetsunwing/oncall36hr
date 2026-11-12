/** 玩家在病房內的位置。前往床邊與返回病房皆即時到達，不推進班次時鐘。 */
import { isWardPatientActive } from './departure';
import { startOrResumeCpr } from '../acls/arrest';
import { buildPresent } from '../bedside/bedside';
import { appendLine } from '../chat/dialogue';
import { removeWhere } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { resolveArrestCallsAtBed } from './arrestCall';

export const PLAYER_ARRIVE_EVENT = 'PLAYER_ARRIVE';

export function patientAtBed(state: GameState, bed: number): string | null {
  for (const patient of Object.values(state.patients))
    if (patient.bed === bed && isWardPatientActive(patient)) return patient.id;
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

export function leaveVisit(state: GameState, patientId: string): GameState {
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
    ...(bed !== null
      ? { shift: { ...state.shift, energy: { ...state.shift.energy, place: null } } }
      : {}),
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

function dropArrival(state: GameState): GameState {
  if (!state.scheduler.items.some((event) => event.kind === PLAYER_ARRIVE_EVENT)) return state;
  return {
    ...state,
    scheduler: removeWhere(state.scheduler, (event) => event.kind === PLAYER_ARRIVE_EVENT),
  };
}

/** 未完成的行走在下一個事件即時到達，班次時鐘不跳到原定到達時間。 */
export function settleTravel(state: GameState, ctx: EngineContext): GameState {
  const { location } = state.ward;
  const traveling = location.movingTo !== null || location.arriveAt !== null;
  if (!traveling) return dropArrival(state);
  const cleared = dropArrival(state);
  const bed = location.movingTo !== null && location.movingTo > 0 ? location.movingTo : null;
  return arriveAt(cleared, bed, ctx);
}

/** 移去指定床（或 null＝病房）。即時到達，不鎖住玩家，也不推進班次時鐘。 */
export function moveTo(state: GameState, bed: number | null, ctx: EngineContext): Reduction {
  const cleared = dropArrival(state);
  const { location } = cleared.ward;
  if (location.movingTo === null && location.arriveAt === null && location.bed === bed) {
    return { state: cleared, effects: [] };
  }
  let next = cleared;
  const effects: Reduction['effects'] = [];
  if (location.bed !== null) {
    const here = patientAtBed(next, location.bed);
    if (here) {
      const resus = next.resus[here];
      // 離床時只恢復已開始、但目前暫停的 CPR；不替玩家開始新的搶救。
      if (
        resus?.status === 'ARREST' &&
        resus.cpr.state === 'PAUSED' &&
        resus.cpr.firstAt !== null &&
        next.patients[here]?.demographics.code !== 'DNR'
      ) {
        const resumed = startOrResumeCpr(next, resus, ctx, null);
        next = resumed.state;
        effects.push(...resumed.effects);
      }
      next = leaveVisit(next, here);
    }
  }
  return { state: arriveAt(next, bed, ctx), effects };
}
