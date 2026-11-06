import type { Beat } from '../chat/dialogue';
import type { EngineContext } from '../core/module';
import { composeOrderLabel } from './label';
import type { Order } from './orderTypes';

/** 護士確認收到 order 嘅 beats（每張 order 一個）；執行者種類令對白講明邊個做 */
export function ackBeatsFor(
  orders: readonly Order[],
  ctx: EngineContext,
): { beats: Beat[]; tokens: Record<string, string> } {
  const tokens: Record<string, string> = {};
  const beats: Beat[] = [];
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
