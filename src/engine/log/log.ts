import type { GameState } from '../core/state';
import type { ActionLogEntry } from './actionLog';

/** 只加一行 log；id 由 state.counters.log 分配 */
export function appendLog(
  state: GameState,
  entry: Omit<ActionLogEntry, 'id' | 't'> & { t?: number },
): GameState {
  const id = `l${String(state.counters.log + 1)}`;
  const full: ActionLogEntry = { ...entry, id, t: entry.t ?? state.clock.t };
  return {
    ...state,
    counters: { ...state.counters, log: state.counters.log + 1 },
    actionLog: [...state.actionLog, full],
  };
}

export function logEvent(
  state: GameState,
  input: { patientId: string | null; reasonCode: string },
): GameState {
  return appendLog(state, {
    patientId: input.patientId,
    kind: 'EVENT',
    orderId: null,
    executor: null,
    reasonCode: input.reasonCode,
    resultText: null,
    nurseNote: null,
  });
}

export function updateOrderLog(
  state: GameState,
  orderId: string,
  patch: Partial<Pick<ActionLogEntry, 'reasonCode' | 'resultText' | 'nurseNote'>>,
): GameState {
  return {
    ...state,
    actionLog: state.actionLog.map((entry) =>
      entry.kind === 'ORDER' && entry.orderId === orderId ? { ...entry, ...patch } : entry,
    ),
  };
}
