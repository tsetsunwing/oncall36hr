import type { OrderCatalogRow } from '../case/tables';
import type { Order } from './orderTypes';

/** Order 顯示名稱：catalog 標籤 ＋ 玩家落單時提供嘅劑量／途徑（全部來自 state，唔係 AI 文字） */
export function composeOrderLabel(
  row: OrderCatalogRow | undefined,
  order: Pick<Order, 'catalogId' | 'params'>,
): string {
  const base = order.params.drugName ?? row?.label ?? order.catalogId;
  const dose = order.params.dose
    ? ` ${String(order.params.dose.value)} ${order.params.dose.unit}`
    : '';
  const route = order.params.route ? ` ${order.params.route}` : '';
  const frequency = order.params.frequency ? ` ${order.params.frequency}` : '';
  const times = order.params.times ? ` x${String(order.params.times)}` : '';
  const rate = order.params.rate
    ? ` ${String(order.params.rate.value)} ${order.params.rate.unit}`
    : '';
  return `${base}${dose}${route}${frequency}${times}${rate}`;
}
