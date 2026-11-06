/**
 * 事件佇列：全序 `(time, priority, seq)`（implementation-plan §8.1），確保同一時刻事件處理次序確定。
 * 純資料結構（plain array），可直接序列化入存檔。
 */
import { z } from 'zod';

export const scheduledEventSchema = z
  .object({
    time: z.number().int().min(0),
    priority: z.number().int(),
    seq: z.number().int().min(0),
    kind: z.string().min(1),
    payload: z.json(),
  })
  .strict();

export type ScheduledEvent = z.infer<typeof scheduledEventSchema>;
export type JsonValue = ScheduledEvent['payload'];

export const eventQueueSchema = z
  .object({
    nextSeq: z.number().int().min(0),
    items: z.array(scheduledEventSchema),
  })
  .strict();

export type EventQueue = z.infer<typeof eventQueueSchema>;

export interface NewScheduledEvent {
  time: number;
  priority?: number;
  kind: string;
  payload?: JsonValue;
}

export function createEventQueue(): EventQueue {
  return { nextSeq: 0, items: [] };
}

function compare(a: ScheduledEvent, b: ScheduledEvent): number {
  return a.time - b.time || a.priority - b.priority || a.seq - b.seq;
}

/** 時間小數向上取整到下一個遊戲秒，避免事件被排喺「過去」 */
export function enqueue(queue: EventQueue, event: NewScheduledEvent): EventQueue {
  const scheduled: ScheduledEvent = {
    time: Math.max(0, Math.ceil(event.time)),
    priority: event.priority ?? 0,
    seq: queue.nextSeq,
    kind: event.kind,
    payload: event.payload ?? null,
  };
  let lo = 0;
  let hi = queue.items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const item = queue.items[mid];
    if (item && compare(item, scheduled) <= 0) lo = mid + 1;
    else hi = mid;
  }
  const items = [...queue.items.slice(0, lo), scheduled, ...queue.items.slice(lo)];
  return { nextSeq: queue.nextSeq + 1, items };
}

export function peek(queue: EventQueue): ScheduledEvent | undefined {
  return queue.items[0];
}

export function pop(queue: EventQueue): { event: ScheduledEvent; queue: EventQueue } | undefined {
  const [event, ...items] = queue.items;
  if (!event) return undefined;
  return { event, queue: { nextSeq: queue.nextSeq, items } };
}

export function removeWhere(
  queue: EventQueue,
  predicate: (event: ScheduledEvent) => boolean,
): EventQueue {
  return { nextSeq: queue.nextSeq, items: queue.items.filter((e) => !predicate(e)) };
}
