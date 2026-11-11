/** 已離開病房仍保留病人及醫囑歷史；只釋放床位，不刪除待出的報告。 */
import type { Patient } from '../case/patient';
import type { GameState } from '../core/state';
import { logEvent, updateOrderLog } from '../log/log';
import { removeWhere } from '../core/eventQueue';
import { CANCELLABLE_STATUSES } from '../orders/orderTypes';
import { cancelPlannedAdministrations } from '../orders/medicationAdministration';

export const DEPARTED_FLAG = 'ward.departed';
export function isWardPatientActive(patient: Patient): boolean {
  return !patient.hidden.fsm.flags.includes(DEPARTED_FLAG);
}

export function departPatient(
  state: GameState,
  patientId: string,
  reason: 'TRANSFER' | 'DISCHARGE' | 'DEATH',
): GameState {
  const patient = state.patients[patientId];
  if (!state.ward.enabled || !patient || !isWardPatientActive(patient)) return state;
  const t = state.clock.t;
  let next: GameState = {
    ...state,
    patients: {
      ...state.patients,
      [patientId]: {
        ...patient,
        hidden: {
          ...patient.hidden,
          fsm: { ...patient.hidden.fsm, flags: [...patient.hidden.fsm.flags, DEPARTED_FLAG] },
        },
      },
    },
    ward: {
      ...state.ward,
      location:
        state.ward.location.bed === patient.bed
          ? { bed: null, movingTo: null, arriveAt: null }
          : state.ward.location,
      draft: state.ward.draft?.patientId === patientId ? null : state.ward.draft,
      calls: state.ward.calls.map((call) =>
        call.patientId === patientId && (call.status === 'RINGING' || call.status === 'DEFERRED')
          ? { ...call, status: 'DONE' as const, resolution: 'PATIENT_DEPARTED' }
          : call,
      ),
      tasks: state.ward.tasks.map((task) =>
        task.patientId === patientId && task.status === 'RUNNING'
          ? { ...task, status: 'FAILED' as const, failureCode: 'PATIENT_DEPARTED' }
          : task,
      ),
    },
    scheduler: removeWhere(
      state.scheduler,
      (event) =>
        event.kind === 'VITALS_SAMPLE' &&
        typeof event.payload === 'object' &&
        event.payload !== null &&
        !Array.isArray(event.payload) &&
        event.payload.patientId === patientId,
    ),
  };
  for (const order of Object.values(next.orders)) {
    if (order.patientId !== patientId || !CANCELLABLE_STATUSES.includes(order.status)) continue;
    next = {
      ...next,
      orders: {
        ...next.orders,
        [order.id]: {
          ...order,
          status: 'CANCELLED',
          cancelledAt: t,
          ...(order.administrations
            ? { administrations: cancelPlannedAdministrations(order.administrations, order.id, t) }
            : {}),
          ...(order.fluidBags
            ? {
                fluidBags: order.fluidBags.map((bag) =>
                  bag.status === 'INFUSING'
                    ? { ...bag, status: 'STOPPED' as const, endedAt: t }
                    : bag,
                ),
              }
            : {}),
        },
      },
    };
    next = updateOrderLog(next, order.id, { reasonCode: 'PATIENT_DEPARTED' });
  }
  return logEvent(next, { patientId, reasonCode: `WARD_${reason}` });
}
