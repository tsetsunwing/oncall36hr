import type { OrderCatalogRow } from '../case/tables';
import type { Order } from './orderTypes';

/** Order 顯示名稱：catalog 標籤 ＋ 玩家落單時提供嘅劑量／途徑（全部來自 state，唔係 AI 文字） */
export function composeOrderLabel(
  row: OrderCatalogRow | undefined,
  order: Pick<Order, 'catalogId' | 'params'>,
): string {
  if (order.params.summary) return order.params.summary;
  const fluid = order.params.fluidRegimen;
  if (fluid)
    return `${fluid.solutions.join(' → ')}${fluid.additive ? ` + ${fluid.additive}` : ''} · ${String(fluid.volumeMl)} mL / ${String(fluid.durationSeconds / 3600)} h${fluid.maxBags ? ` · ${String(fluid.maxBags)} bags` : ''}${fluid.maxDurationSeconds ? ` · ${String(fluid.maxDurationSeconds / 3600)} h total` : ''}`;
  const base = order.params.drugName ?? row?.label ?? order.catalogId;
  const dose = order.params.dose
    ? ` ${String(order.params.dose.value)} ${order.params.dose.unit}`
    : '';
  const route = order.params.route ? ` ${order.params.route}` : '';
  const frequency = order.params.frequency ? ` ${order.params.frequency}` : '';
  const condition = order.params.prnCondition;
  const prn = order.params.prnReason
    ? ` PRN ${order.params.prnReason}${condition ? ` ${condition.comparison} ${String(condition.threshold)}` : ''}`
    : '';
  const times = order.params.times ? ` x${String(order.params.times)}` : '';
  const rate = order.params.rate
    ? ` ${String(order.params.rate.value)} ${order.params.rate.unit}`
    : '';
  const details = [
    order.params.concentration,
    order.params.diluent,
    order.params.volumeMl ? `${String(order.params.volumeMl)} mL` : undefined,
    order.params.infuseOverMinutes
      ? `Infuse over ${String(order.params.infuseOverMinutes)} mins`
      : undefined,
  ].filter((detail): detail is string => Boolean(detail));
  return `${base}${dose}${route}${frequency}${prn}${times}${rate}${details.length ? ` | ${details.join(', ')}` : ''}`;
}
