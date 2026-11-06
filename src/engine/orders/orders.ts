/**
 * Order 生命週期：落單、固定完成時間（S28 A）、取消。
 * 暫停時唔接受新 order，但接受取消（Q76 B、S-6 A）。
 * 由 order-catalog（T4）驅動；完成時套用 flags、凍結結果文字、等護士匯報；
 * 化驗／影像完成後按 T7 排程報告（results 模組）；把關由 gate 模組處理，放行後先排程完成。
 */
import { abnormalOf, patientTokens, queueDialogue, vitalTokens, type Beat } from '../chat/dialogue';
import { extractTokens, renderTemplate } from '../chat/tokens';
import { enqueue, removeWhere } from '../core/eventQueue';
import type { Effect, NoticeKind, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import type { OrderCatalogRow } from '../case/tables';
import { updateOrderLog } from '../log/log';
import { scheduleResultReport } from '../results/results';
import { composeOrderLabel } from './label';
import { CANCELLABLE_STATUSES, type Order } from './orderTypes';

export const ORDER_COMPLETE_EVENT_KIND = 'ORDER_COMPLETE';

function reject(state: GameState, kind: NoticeKind): Reduction {
  return { state, effects: [{ type: 'NOTICE', kind, tone: 'warn' }] };
}

function isOrderCompletePayload(payload: unknown): payload is { orderId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'orderId' in payload &&
    typeof payload.orderId === 'string'
  );
}

export const NO_PARAMS: Order['params'] = { drugFormularyId: null, dose: null, route: null };

export function scheduleCompletion(state: GameState, order: Order): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: order.completesAt,
      kind: ORDER_COMPLETE_EVENT_KIND,
      payload: { orderId: order.id },
    }),
  };
}

/** 登記 order（分配 id 計數）。只有 RUNNING 嘅 order 即時排程完成；GATED 等放行 */
export function registerOrder(state: GameState, order: Order): GameState {
  const registered: GameState = {
    ...state,
    orders: { ...state.orders, [order.id]: order },
    counters: { ...state.counters, order: state.counters.order + 1 },
  };
  return order.status === 'RUNNING' ? scheduleCompletion(registered, order) : registered;
}

export function isCancellable(order: Order, row: OrderCatalogRow | undefined): boolean {
  if (!CANCELLABLE_STATUSES.includes(order.status)) return false;
  if (order.status === 'GATED' || !row) return true;
  return (row.cancelWhile as readonly string[]).includes(order.status);
}

/**
 * 取消 order。冇開始過（等把關）嘅 order 冇任何已投入部分；
 * 已開始嘅按 catalog `sunkEffectRule` 處理（見 vitals.sunkFraction）。
 */
export function cancelOrderState(state: GameState, order: Order, reasonCode: string): GameState {
  const now = state.clock.t;
  const neverStarted = order.status === 'GATED' || order.status === 'PENDING_PARSE';
  const cancelled: GameState = {
    ...state,
    orders: {
      ...state.orders,
      [order.id]: {
        ...order,
        status: 'CANCELLED',
        cancelledAt: now,
        ...(neverStarted ? { startsAt: now, completesAt: now } : {}),
      },
    },
    scheduler: removeWhere(
      state.scheduler,
      (e) =>
        e.kind === ORDER_COMPLETE_EVENT_KIND &&
        isOrderCompletePayload(e.payload) &&
        e.payload.orderId === order.id,
    ),
  };
  return updateOrderLog(cancelled, order.id, { reasonCode });
}

export function completeOrder(state: GameState, order: Order, ctx: EngineContext): Reduction {
  const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
  let next: GameState = {
    ...state,
    orders: { ...state.orders, [order.id]: { ...order, status: 'DONE' } },
  };
  const effects: Effect[] = [];
  const patient = next.patients[order.patientId];
  if (!row || !patient) return { state: next, effects };

  const flags = [...new Set([...patient.hidden.fsm.flags, ...row.setsFlags])];
  const withFlags = {
    ...patient,
    hidden: { ...patient.hidden, fsm: { ...patient.hidden.fsm, flags } },
  };
  next = { ...next, patients: { ...next.patients, [patient.id]: withFlags } };

  if (row.resultId) {
    next = scheduleResultReport(next, order.id, withFlags.hidden.fsm.state, row, ctx);
  }

  if (row.resultTemplate) {
    const tokens = { ...vitalTokens(withFlags, ctx.tables), ...patientTokens(withFlags) };
    next = updateOrderLog(next, order.id, {
      resultText: renderTemplate(row.resultTemplate, tokens),
    });
    const label = composeOrderLabel(row, order);
    const resultTokens = extractTokens(row.resultTemplate);
    const beat: Beat = {
      type: 'REPORT_RESULT',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: resultTokens,
      abnormal: abnormalOf(withFlags, ctx.tables),
    };
    const queued = queueDialogue(
      next,
      {
        patientId: patient.id,
        beats: [beat],
        tokens: { ...tokens, 'order.1.label': label },
        addressed: [],
      },
      ctx,
    );
    if (queued) {
      next = queued.state;
      effects.push(queued.effect);
    }
  }
  return { state: next, effects };
}

export const ordersModule: EngineModule = {
  name: 'orders',

  handleIntent(state, intent, ctx) {
    if (intent.type === 'PLACE_ORDER') {
      if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
      const { patientId, catalogId, durationSec } = intent;
      if (
        patientId.length === 0 ||
        catalogId.length === 0 ||
        !Number.isInteger(durationSec) ||
        durationSec < 0
      ) {
        return reject(state, 'ORDER_INVALID');
      }
      const id = `o${String(state.counters.order + 1)}`;
      const now = state.clock.t;
      const order: Order = {
        id,
        patientId,
        catalogId,
        createdAt: now,
        startsAt: now,
        completesAt: now + durationSec,
        status: 'RUNNING',
        source: 'MANUAL',
        params: NO_PARAMS,
        executor: null,
        executorKind: null,
        cancelledAt: null,
        resultStatus: null,
        sampledState: null,
        gate: null,
      };
      return { state: registerOrder(state, order), effects: [] };
    }

    if (intent.type === 'CANCEL_ORDER') {
      const order = state.orders[intent.orderId];
      if (!order) return reject(state, 'ORDER_UNKNOWN');
      const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
      if (!isCancellable(order, row)) return reject(state, 'ORDER_NOT_CANCELLABLE');
      return { state: cancelOrderState(state, order, 'CANCELLED_BY_PLAYER'), effects: [] };
    }
    return undefined;
  },

  handleScheduled(state, event, ctx) {
    if (event.kind !== ORDER_COMPLETE_EVENT_KIND) return undefined;
    if (!isOrderCompletePayload(event.payload)) return { state, effects: [] };
    const order = state.orders[event.payload.orderId];
    if (order?.status !== 'RUNNING') return { state, effects: [] };
    return completeOrder(state, order, ctx);
  },
};
