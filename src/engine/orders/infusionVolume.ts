/**
 * 輸液實際滴入量：按每袋的開始／預定結束時間線性推算。
 * 提早停袋（STOPPED）只計已滴入部分，所以「部分輸入量」不會當成整袋。
 */
import type { Order } from './orderTypes';

/** 到 t 為止，這張醫囑所有袋已滴入的總容量（mL）。 */
export function infusedVolumeMl(order: Order, t: number): number {
  let total = 0;
  for (const bag of order.fluidBags ?? []) {
    if (t <= bag.startAt) continue;
    const span = bag.scheduledEndAt - bag.startAt;
    if (span <= 0) {
      total += bag.volumeMl;
      continue;
    }
    const end = Math.min(bag.endedAt ?? t, bag.scheduledEndAt);
    const elapsed = Math.max(0, end - bag.startAt);
    total += bag.volumeMl * Math.min(1, elapsed / span);
  }
  return total;
}

/** 一袋的參考容量：用最大袋容量，令一袋滴完＝完整效果。 */
export function referenceBagMl(order: Order): number {
  const bags = order.fluidBags ?? [];
  return bags.reduce((max, bag) => Math.max(max, bag.volumeMl), 0);
}

/** 0–1：已滴入量佔一袋的比例，用嚟按容量縮放生理效果。 */
export function fluidVolumeFactor(order: Order, t: number): number {
  const reference = referenceBagMl(order);
  if (reference <= 0) return 0;
  return Math.min(1, infusedVolumeMl(order, t) / reference);
}
