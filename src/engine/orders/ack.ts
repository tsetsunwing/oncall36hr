import type { Beat } from '../chat/dialogue';
import type { EngineContext } from '../core/module';
import { composeOrderLabel } from './label';
import type { Order } from './orderTypes';

/**
 * 護士確認收到 order 嘅 beats（每張 order 一個）；執行者種類令對白講明邊個做。
 * combine＝抽血籃：多張化驗單只講一句「收到，我即刻做 A、B、C」。
 */
export function ackBeatsFor(
  orders: readonly Order[],
  ctx: EngineContext,
  combine = false,
): { beats: Beat[]; tokens: Record<string, string> } {
  const tokens: Record<string, string> = {};
  const beats: Beat[] = [];
  if (combine && orders.length > 0) {
    const label = orders
      .map((order) => {
        const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
        return composeOrderLabel(row, order);
      })
      .join('、');
    tokens['order.batch.label'] = label;
    return {
      beats: [
        {
          type: 'ACK_ORDER',
          speaker: 'NURSE',
          labelToken: 'order.batch.label',
          executor: orders[0]?.executorKind ?? null,
        },
      ],
      tokens,
    };
  }
  orders.forEach((order, index) => {
    const token = `order.${String(index + 1)}.label`;
    const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
    tokens[token] = composeOrderLabel(row, order);
    beats.push({
      type: 'ACK_ORDER',
      speaker: 'NURSE',
      labelToken: token,
      executor: order.executorKind,
    });
  });
  return { beats, tokens };
}
