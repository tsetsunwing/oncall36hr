import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEventQueue, enqueue, peek, pop, removeWhere, type EventQueue } from './eventQueue';

describe('event queue', () => {
  it('orders by (time, priority, seq)', () => {
    let q = createEventQueue();
    q = enqueue(q, { time: 10, priority: 5, kind: 'c' });
    q = enqueue(q, { time: 10, priority: 1, kind: 'b' });
    q = enqueue(q, { time: 5, priority: 9, kind: 'a' });
    q = enqueue(q, { time: 10, priority: 1, kind: 'b2' });
    const order: string[] = [];
    for (let p = pop(q); p; p = pop(p.queue)) order.push(p.event.kind);
    expect(order).toEqual(['a', 'b', 'b2', 'c']);
  });

  it('always pops in non-decreasing total order, whatever the insertion order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            time: fc.integer({ min: 0, max: 50 }),
            priority: fc.integer({ min: -3, max: 3 }),
          }),
        ),
        (items) => {
          const q = items.reduce<EventQueue>(
            (acc, item, i) => enqueue(acc, { ...item, kind: `k${String(i)}` }),
            createEventQueue(),
          );
          const popped = [];
          for (let p = pop(q); p; p = pop(p.queue)) popped.push(p.event);
          expect(popped).toHaveLength(items.length);
          for (let i = 1; i < popped.length; i++) {
            const a = popped[i - 1]!;
            const b = popped[i]!;
            const cmp = a.time - b.time || a.priority - b.priority || a.seq - b.seq;
            expect(cmp).toBeLessThan(0);
          }
        },
      ),
    );
  });

  it('is immutable and supports peek/removeWhere', () => {
    const empty = createEventQueue();
    const one = enqueue(empty, { time: 3, kind: 'x', payload: { n: 1 } });
    expect(empty.items).toHaveLength(0);
    expect(peek(one)?.kind).toBe('x');
    expect(removeWhere(one, (e) => e.kind === 'x').items).toHaveLength(0);
    expect(one.items).toHaveLength(1);
    expect(pop(empty)).toBeUndefined();
  });

  it('never schedules into the past or at fractional times', () => {
    const q = enqueue(createEventQueue(), { time: -5, kind: 'neg' });
    const r = enqueue(q, { time: 2.2, kind: 'frac' });
    expect(r.items.map((e) => e.time)).toEqual([0, 3]);
  });
});
