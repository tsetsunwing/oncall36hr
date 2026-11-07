import type { OrderCatalogRow, DelegationResultRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Order } from '../orders/orderTypes';
import { RngCursor } from './rngCursor';
import type { DelegationTaskId, WardTask } from './wardTypes';

type FailureMode = 'DELAYED' | 'INCOMPLETE' | 'WRONG';
export interface Rolled {
  state: GameState;
  durationSec: number;
  mode: WardTask['mode'];
}

export function subIsBusy(state: GameState): boolean {
  const sub = state.ward.sub;
  return sub !== null && sub.busyUntil > state.clock.t;
}

export function delegationRow(
  ctx: EngineContext,
  task: DelegationTaskId,
): DelegationResultRow | undefined {
  return ctx.tables['delegation-results'].find((r) => r.task === task);
}

export function taskKindOfCatalog(row: OrderCatalogRow): DelegationTaskId {
  return row.type === 'PROCEDURE' ? 'PROCEDURE' : 'ORDER_NOTE';
}

/** 擲可靠度同決定速度：同 seed 同結果；用 staff 分流，唔影響其他系統 */
export function rollSubordinate(
  state: GameState,
  ctx: EngineContext,
  baseSec: number,
  task: DelegationTaskId,
): Rolled {
  const sub = state.ward.sub;
  if (!sub) return { state, durationSec: baseSec, mode: 'OK' };
  const cursor = new RngCursor(state.rng);
  const row = delegationRow(ctx, task);
  let durationSec = Math.max(1, Math.round(baseSec * ctx.config.staff.speedMultiplier[sub.level]));
  let mode: WardTask['mode'] = 'OK';
  const succeeded = cursor.chance('staff', ctx.config.staff.reliability[sub.level]);
  if (!succeeded) {
    const modes: readonly FailureMode[] = row?.byLevel[sub.level].failureModes ?? ['DELAYED'];
    mode = modes[cursor.int('staff', 0, Math.max(1, modes.length))] ?? 'DELAYED';
  }
  if (mode === 'DELAYED') {
    durationSec += Math.round(durationSec * (row?.delayExtraMultiplier ?? 1));
  }
  return { state: { ...state, rng: cursor.rng }, durationSec, mode };
}

export function addTask(
  state: GameState,
  task: Omit<WardTask, 'id'>,
): { state: GameState; id: string } {
  const id = `t${String(state.ward.counters.task + 1)}`;
  const sub = state.ward.sub;
  return {
    id,
    state: {
      ...state,
      ward: {
        ...state.ward,
        counters: { ...state.ward.counters, task: state.ward.counters.task + 1 },
        tasks: [...state.ward.tasks, { ...task, id }],
        sub: sub ? { ...sub, busyUntil: Math.max(sub.busyUntil, task.completesAt) } : sub,
      },
    },
  };
}

/** placement 落咗一張下屬執行嘅 order：記入委派清單，下屬轉忙碌 */
export function recordSubordinateOrder(
  state: GameState,
  order: Order,
  row: OrderCatalogRow,
  mode: WardTask['mode'],
): GameState {
  return addTask(state, {
    task: taskKindOfCatalog(row),
    itemId: row.id,
    label: row.label,
    patientId: order.patientId,
    callId: null,
    orderId: order.id,
    startsAt: order.startsAt,
    completesAt: order.completesAt,
    status: 'RUNNING',
    mode,
    failureCode: null,
  }).state;
}
