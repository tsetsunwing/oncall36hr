/**
 * 落單：揀執行者、決定要唔要把關、建立 order。
 * 要把關嘅 order 以 GATED 狀態等候（唔生效、唔排程完成），
 * 藥房（有 pharmacyGate 嘅藥物一律）同護士（資歷 NEW 唔會、其餘按 nurseGate）並行審視。
 */
import { queueBeatsForOrders } from '../bedside/queue';
import type { Present } from '../chat/chatTypes';
import type { Patient } from '../case/patient';
import type { ExecutorKind, OrderCatalogRow } from '../case/tables';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { requestGateReview } from '../gate/gateRequest';
import type { GateRecord, GateReview, GateRole } from '../gate/gateTypes';
import { appendLog } from '../log/log';
import { ackBeatsFor } from './ack';
import { chooseExecutor, executorDurationSec, executorRef } from './executors';
import type { Order } from './orderTypes';
import { registerOrder } from './orders';
import { scoreOrderCommitted } from '../score/requiredOrders';
import { recordSubordinateOrder, rollSubordinate, taskKindOfCatalog } from '../ward/subRoll';

export const ORDER_AWAITING_GATE_CODE = 'AWAITING_GATE';

export interface PlaceInput {
  patientId: string;
  row: OrderCatalogRow;
  params: Order['params'];
  source: Order['source'];
  preferredExecutor: ExecutorKind | null;
  /** 玩家按下送出嘅時刻。AI 解析較慢時，生效時間唔會因而推遲（§2.4） */
  submittedAt: number;
}

export function nurseSeniority(state: GameState, ctx: EngineContext) {
  return ctx.config.staff.nurseSeniorityByDifficulty[state.difficulty];
}

/** 呢張 order 需要邊啲把關者：藥房一律（有 pharmacyGate）；新入職護士完全唔提醒 */
export function gateRolesFor(
  state: GameState,
  row: OrderCatalogRow,
  ctx: EngineContext,
): GateRole[] {
  const roles: GateRole[] = [];
  if (row.pharmacyGate) roles.push('PHARMACY');
  const nurseGates =
    row.nurseGate === 'ALWAYS' ||
    (row.nurseGate === 'HIGH_RISK' && state.options.nurseConfirmHighRisk);
  if (nurseGates && nurseSeniority(state, ctx) !== 'NEW') roles.push('NURSE');
  return roles;
}

function nurseOf(present: readonly Present[] | undefined): Present | undefined {
  return present?.find((p) => p.kind === 'NURSE');
}

export interface Placed {
  state: GameState;
  order: Order;
  effects: Effect[];
}

export function placeCatalogOrder(state: GameState, input: PlaceInput, ctx: EngineContext): Placed {
  const now = state.clock.t;
  const nurse = nurseOf(state.chats[input.patientId]?.present);
  const kind = chooseExecutor(state, input.row, input.preferredExecutor);
  let duration = executorDurationSec(kind, input.row.fixedDurationSec, ctx.config);
  let working = state;
  let subMode: 'OK' | 'DELAYED' | 'INCOMPLETE' | 'WRONG' | null = null;
  if (kind === 'SUBORDINATE' && state.ward.enabled) {
    const rolled = rollSubordinate(
      state,
      ctx,
      input.row.fixedDurationSec,
      taskKindOfCatalog(input.row),
    );
    working = rolled.state;
    duration = rolled.durationSec;
    subMode = rolled.mode;
  }
  const roles = gateRolesFor(state, input.row, ctx);
  const id = `o${String(state.counters.order + 1)}`;
  const executor = executorRef(kind, nurse?.id ?? null);

  const base: Order = {
    id,
    patientId: input.patientId,
    catalogId: input.row.id,
    createdAt: input.submittedAt,
    startsAt: input.submittedAt,
    completesAt: Math.max(input.submittedAt + duration, now),
    status: roles.length === 0 ? 'RUNNING' : 'GATED',
    source: input.source,
    params: input.params,
    executor,
    executorKind: kind,
    cancelledAt: null,
    resultStatus: null,
    sampledState: null,
    gate: null,
  };

  let next = registerOrder(working, base);
  if (subMode) next = recordSubordinateOrder(next, base, input.row, subMode);
  next = appendLog(next, {
    patientId: input.patientId,
    kind: 'ORDER',
    orderId: id,
    executor,
    reasonCode: roles.length === 0 ? null : ORDER_AWAITING_GATE_CODE,
    resultText: null,
    nurseNote: null,
  });
  if (roles.length === 0) {
    return { state: scoreOrderCommitted(next, base, ctx), order: base, effects: [] };
  }

  const effects: Effect[] = [];
  const reviews: GateReview[] = [];
  const nurseId = nurse?.id ?? null;
  for (const role of roles) {
    const requested = requestGateReview(next, base, input.row, role, nurseId, ctx);
    if (!requested) continue;
    next = requested.state;
    effects.push(requested.effect);
    reviews.push({
      by: role,
      reqId: requested.reqId,
      status: 'PENDING',
      verdict: null,
      concerns: [],
      safety: null,
    });
  }
  const gate: GateRecord = {
    phase: 'REVIEW',
    required: 0,
    insistCount: 0,
    reviews,
    danger: null,
    roll: null,
    rolled: null,
  };
  const gated: Order = { ...base, gate };
  next = { ...next, orders: { ...next.orders, [id]: gated } };
  return { state: next, order: gated, effects };
}

/** 逐張落單；放行（唔使把關）嘅 order 由護士確認，要把關嘅等把關結果先確認 */
export function placeAndAck(
  state: GameState,
  patient: Patient,
  inputs: readonly PlaceInput[],
  addressed: string[],
  ctx: EngineContext,
): Reduction {
  let next = state;
  const effects: Effect[] = [];
  const running: Order[] = [];
  for (const input of inputs) {
    const placed = placeCatalogOrder(next, input, ctx);
    next = placed.state;
    effects.push(...placed.effects);
    if (placed.order.status === 'RUNNING') running.push(placed.order);
  }
  if (running.length === 0) return { state: next, effects };
  const { beats, tokens } = ackBeatsFor(running, ctx);
  const dialogue = queueBeatsForOrders(next, patient, beats, tokens, addressed, ctx);
  return { state: dialogue.state, effects: [...effects, ...dialogue.effects] };
}
