/**
 * Order 生命週期（M1 骨架）：落單、固定完成時間（S28 A）、取消。
 * 暫停時唔接受新 order，但接受取消（Q76 B、S-6 A）。
 * 化驗／藥物／把關／執行者等屬 M3，呢度只提供生命週期同時間規則。
 */
import { enqueue, removeWhere } from '../core/eventQueue';
import type { NoticeKind, Reduction } from '../core/events';
import type { EngineModule } from '../core/module';
import type { GameState } from '../core/state';
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

export const ordersModule: EngineModule = {
  name: 'orders',

  handleIntent(state, intent) {
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
      };
      return {
        state: {
          ...state,
          orders: { ...state.orders, [id]: order },
          counters: { ...state.counters, order: state.counters.order + 1 },
          scheduler: enqueue(state.scheduler, {
            time: order.completesAt,
            kind: ORDER_COMPLETE_EVENT_KIND,
            payload: { orderId: id },
          }),
        },
        effects: [],
      };
    }

    if (intent.type === 'CANCEL_ORDER') {
      const order = state.orders[intent.orderId];
      if (!order) return reject(state, 'ORDER_UNKNOWN');
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        return reject(state, 'ORDER_NOT_CANCELLABLE');
      }
      return {
        state: {
          ...state,
          orders: { ...state.orders, [order.id]: { ...order, status: 'CANCELLED' } },
          scheduler: removeWhere(
            state.scheduler,
            (e) =>
              e.kind === ORDER_COMPLETE_EVENT_KIND &&
              isOrderCompletePayload(e.payload) &&
              e.payload.orderId === order.id,
          ),
        },
        effects: [],
      };
    }
    return undefined;
  },

  handleScheduled(state, event) {
    if (event.kind !== ORDER_COMPLETE_EVENT_KIND) return undefined;
    if (!isOrderCompletePayload(event.payload)) return { state, effects: [] };
    const order = state.orders[event.payload.orderId];
    if (order?.status !== 'RUNNING') return { state, effects: [] };
    return {
      state: { ...state, orders: { ...state.orders, [order.id]: { ...order, status: 'DONE' } } },
      effects: [],
    };
  },
};
