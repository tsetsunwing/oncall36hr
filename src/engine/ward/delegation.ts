/**
 * 下屬委派（S-1、S-4）：HO 冇下屬；MO／RES 恰好一位。
 * 資歷（level）只喺呢度同 placement 讀：用嚟定速度倍數同可靠度擲骰，結果只經「實際表現」睇到（B7）。
 * 責任永遠喺玩家：失敗會入計分流水（DELEGATION_FAILED）。
 */
import { enqueue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import { logEvent, updateOrderLog } from '../log/log';
import { completeOrder, ORDER_COMPLETE_EVENT_KIND } from '../orders/orders';
import type { Order } from '../orders/orderTypes';
import { placeCatalogOrder } from '../orders/placement';
import { NO_PARAMS } from '../orders/orders';
import { findCall, missCall } from './calls';
import { addTask, delegationRow, rollSubordinate, subIsBusy } from './subRoll';
import { addPatientFlag } from './movement';
import { applyRule } from '../score/scoring';
import type { DelegationTaskId, WardTask } from './wardTypes';

export const DELEGATION_COMPLETE_EVENT = 'DELEGATION_COMPLETE';
export const DELEGATION_PRIORITY = 15;

const notice = (
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
  tone: 'info' | 'warn' = 'warn',
): Effect => ({ type: 'NOTICE', kind, tone });

function updateTask(state: GameState, id: string, patch: Partial<WardTask>): GameState {
  return {
    ...state,
    ward: {
      ...state.ward,
      tasks: state.ward.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    },
  };
}

export interface DelegateRequest {
  task: DelegationTaskId;
  itemId: string;
  patientId: string | null;
  callId: string | null;
}

export function delegate(state: GameState, req: DelegateRequest, ctx: EngineContext): Reduction {
  const sub = state.ward.sub;
  if (!sub) return { state, effects: [notice('DELEGATE_NO_SUB')] };
  if (subIsBusy(state)) return { state, effects: [notice('DELEGATE_BUSY')] };
  const invalid: Reduction = { state, effects: [notice('DELEGATE_INVALID')] };
  const group = delegationRow(ctx, req.task);
  const item = group?.items.find((i) => i.id === req.itemId);
  if (!group || !item) return invalid;
  const patient = req.patientId ? state.patients[req.patientId] : undefined;
  if (item.needsPatient && !patient) return invalid;
  if (
    item.needsTag &&
    (!req.patientId || !state.ward.tags[req.patientId]?.includes(item.needsTag))
  ) {
    return invalid;
  }
  const t = state.clock.t;

  if (item.catalogId) {
    const row = ctx.tables['order-catalog'].find((r) => r.id === item.catalogId);
    if (!row || !patient || !row.executors.includes('SUBORDINATE')) return invalid;
    const placed = placeCatalogOrder(
      state,
      {
        patientId: patient.id,
        row,
        params: NO_PARAMS,
        source: 'MANUAL',
        preferredExecutor: 'SUBORDINATE',
        submittedAt: t,
      },
      ctx,
    );
    return {
      state: logEvent(placed.state, { patientId: patient.id, reasonCode: `DELEGATED_${row.id}` }),
      effects: [...placed.effects, notice('DELEGATE_STARTED', 'info')],
    };
  }

  if (req.task === 'SIMPLE_CALL') {
    const call = req.callId ? findCall(state, req.callId) : undefined;
    if (call?.direction !== 'IN' || !call.delegable) return invalid;
    if (call.status !== 'RINGING' && call.status !== 'DEFERRED') return invalid;
  }
  const base = item.baseDurationSec ?? 300;
  const rolled = rollSubordinate(state, ctx, base, req.task);
  const completesAt = t + rolled.durationSec;
  const added = addTask(rolled.state, {
    task: req.task,
    itemId: item.id,
    label: item.label,
    patientId: req.patientId,
    callId: req.callId,
    orderId: null,
    startsAt: t,
    completesAt,
    status: 'RUNNING',
    mode: rolled.mode,
    failureCode: null,
  });
  let next: GameState = {
    ...added.state,
    scheduler: enqueue(added.state.scheduler, {
      time: completesAt,
      priority: DELEGATION_PRIORITY,
      kind: DELEGATION_COMPLETE_EVENT,
      payload: { taskId: added.id },
    }),
  };
  if (req.task === 'SIMPLE_CALL' && req.callId) {
    const call = findCall(next, req.callId);
    if (call) {
      next = {
        ...next,
        ward: {
          ...next.ward,
          calls: next.ward.calls.map((c) =>
            c.id === call.id ? { ...c, status: 'DELEGATED', resolution: 'DELEGATED' } : c,
          ),
        },
      };
    }
  }
  next = logEvent(next, { patientId: req.patientId, reasonCode: `DELEGATED_${item.id}` });
  return { state: next, effects: [notice('DELEGATE_STARTED', 'info')] };
}

function failTask(state: GameState, task: WardTask, ctx: EngineContext): Reduction {
  const code = `SUB_${task.mode}`;
  let next = updateTask(state, task.id, { status: 'FAILED', failureCode: code });
  next = applyRule(next, 'DELEGATION_FAILED', ctx, {
    callId: task.callId,
    patientId: task.patientId,
    evidence: `task:${task.id}`,
    facts: { task: task.task, mode: task.mode },
  });
  next = logEvent(next, { patientId: task.patientId, reasonCode: code });
  return { state: next, effects: [notice('DELEGATE_FAILED')] };
}

function finishTask(state: GameState, task: WardTask, ctx: EngineContext): Reduction {
  if (task.mode === 'INCOMPLETE' || task.mode === 'WRONG') {
    let next = state;
    const effects: Effect[] = [];
    const failed = failTask(next, task, ctx);
    next = failed.state;
    effects.push(...failed.effects);
    if (task.task === 'SIMPLE_CALL' && task.callId) {
      const call = findCall(next, task.callId);
      if (call?.status === 'DELEGATED') {
        const missed = missCall(next, { ...call, status: 'RINGING' }, ctx);
        next = missed.state;
      }
    }
    return { state: next, effects };
  }
  let next = updateTask(state, task.id, { status: 'DONE' });
  const group = delegationRow(ctx, task.task);
  const item = group?.items.find((i) => i.id === task.itemId);
  if (item?.setsFlag && task.patientId) next = addPatientFlag(next, task.patientId, item.setsFlag);
  if (item?.clearsTag && task.patientId) {
    const tags = next.ward.tags[task.patientId] ?? [];
    next = {
      ...next,
      ward: {
        ...next.ward,
        tags: { ...next.ward.tags, [task.patientId]: tags.filter((x) => x !== item.clearsTag) },
      },
    };
  }
  if (task.task === 'SIMPLE_CALL' && task.callId) {
    next = applyRule(next, 'CALL_DELEGATED_OK', ctx, {
      callId: task.callId,
      patientId: task.patientId,
      evidence: `task:${task.id}`,
    });
    next = {
      ...next,
      ward: {
        ...next.ward,
        calls: next.ward.calls.map((c) =>
          c.id === task.callId ? { ...c, status: 'DONE', resolution: 'DELEGATED_OK' } : c,
        ),
      },
    };
  }
  next = logEvent(next, { patientId: task.patientId, reasonCode: `DONE_${task.itemId}` });
  return { state: next, effects: [notice('DELEGATE_DONE', 'info')] };
}

export function handleDelegationComplete(
  state: GameState,
  taskId: string,
  ctx: EngineContext,
): Reduction {
  const task = state.ward.tasks.find((t) => t.id === taskId);
  if (task?.status !== 'RUNNING') return { state, effects: [] };
  return finishTask(state, task, ctx);
}

function isOrderPayload(payload: unknown): payload is { orderId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'orderId' in payload &&
    typeof payload.orderId === 'string'
  );
}

/** 攔住下屬做嘅 order：失敗（INCOMPLETE／WRONG）就唔生效；成功交返 orders 正常完成 */
export const subordinateOrderModule: EngineModule = {
  name: 'subordinate-orders',

  handleScheduled(state, event, ctx) {
    if (event.kind !== ORDER_COMPLETE_EVENT_KIND || !isOrderPayload(event.payload))
      return undefined;
    const orderId = event.payload.orderId;
    const task = state.ward.tasks.find((t) => t.orderId === orderId && t.status === 'RUNNING');
    const order = state.orders[orderId];
    if (!task || order?.status !== 'RUNNING') return undefined;
    if (task.mode === 'INCOMPLETE' || task.mode === 'WRONG') {
      const failedOrder: Order = { ...order, status: 'FAILED' };
      const next = updateOrderLog(
        { ...state, orders: { ...state.orders, [orderId]: failedOrder } },
        orderId,
        { reasonCode: `SUB_${task.mode}` },
      );
      return failTask(next, task, ctx);
    }
    const done = updateTask(state, task.id, { status: 'DONE' });
    const completed = completeOrder(done, order, ctx);
    return {
      state: completed.state,
      effects: [...completed.effects, notice('DELEGATE_DONE', 'info')],
    };
  },
};
