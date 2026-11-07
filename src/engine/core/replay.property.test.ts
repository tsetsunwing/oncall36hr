import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from './events';
import { defaultModules, replay } from './reducer';
import { gameStateSchema } from './state';
import { deserializeSnapshot, serializeSnapshot } from '../save/snapshot';
import { intent, makeEngine, newGame, tick } from '../test/helpers';
import { probeModule } from '../test/probeModule';

const modules = [...defaultModules, probeModule];
const startProbe = intent({ type: 'EXTENSION', module: 'probe', name: 'start', payload: null });

const eventArb: fc.Arbitrary<EngineEvent> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 180_000 }).map(tick) },
  { weight: 1, arbitrary: fc.constant(intent({ type: 'PAUSE' })) },
  { weight: 1, arbitrary: fc.constant(intent({ type: 'RESUME' })) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(0, 1, 2, 3, 4).map((speed) => intent({ type: 'SET_SPEED', speed })),
  },
  {
    weight: 3,
    arbitrary: fc
      .tuple(
        fc.constantFrom('p1', 'p2', ''),
        fc.constantFrom('lab.cbc', 'drug.x'),
        fc.integer({ min: -5, max: 3600 }),
      )
      .map(([patientId, catalogId, durationSec]) =>
        intent({ type: 'PLACE_ORDER', patientId, catalogId, durationSec }),
      ),
  },
  {
    weight: 2,
    arbitrary: fc
      .integer({ min: 1, max: 12 })
      .map((n) => intent({ type: 'CANCEL_ORDER', orderId: `o${String(n)}` })),
  },
  {
    weight: 1,
    arbitrary: fc.integer({ min: 0, max: 6 }).map((slot) => intent({ type: 'SAVE_GAME', slot })),
  },
  { weight: 1, arbitrary: fc.constant(startProbe) },
  {
    weight: 1,
    arbitrary: fc.constant<EngineEvent>({ type: 'AI_FAILURE', reqId: 'r1', reason: 'TIMEOUT' }),
  },
  { weight: 1, arbitrary: fc.constant<EngineEvent>({ type: 'RESUME_FROM_FAILURE', reqId: 'r1' }) },
);

const eventsArb = fc.array(eventArb, { maxLength: 60 });
const seedArb = fc.string({ maxLength: 12 });

describe('replay determinism (M1 acceptance)', () => {
  it('same seed + same events → identical state, effects and bytes (two independent engines)', () => {
    fc.assert(
      fc.property(seedArb, eventsArb, (seed, events) => {
        const params = { ...newGame, seed };
        const a = makeEngine({ modules });
        const b = makeEngine({ modules });
        const withProbe = [startProbe, ...events];
        const ra = replay(a, a.init(params), withProbe);
        const rb = replay(b, b.init(params), withProbe);
        expect(rb.state).toEqual(ra.state);
        expect(rb.effects).toEqual(ra.effects);
        expect(serializeSnapshot(rb.state, 'v')).toBe(serializeSnapshot(ra.state, 'v'));
      }),
      { numRuns: 300 },
    );
  });

  it('RNG streams are actually consumed during the replay and depend on the seed', () => {
    const e = makeEngine({ modules });
    const events = [startProbe, tick(180_000), tick(180_000)];
    const one = replay(e, e.init({ ...newGame, seed: 'one' }), events).state;
    const two = replay(e, e.init({ ...newGame, seed: 'two' }), events).state;
    expect(one.rng.events).not.toBe(e.init({ ...newGame, seed: 'one' }).rng.events);
    expect(Object.values(one.orders).length).toBeGreaterThan(0);
    expect(one.orders).not.toEqual(two.orders);
  });

  it('every reachable state is schema-valid and survives a bit-identical save round trip', () => {
    fc.assert(
      fc.property(seedArb, eventsArb, (seed, events) => {
        const e = makeEngine({ modules });
        const { state } = replay(e, e.init({ ...newGame, seed }), [startProbe, ...events]);
        expect(gameStateSchema.safeParse(state).success).toBe(true);
        const json = serializeSnapshot(state, '1.0.0');
        const loaded = deserializeSnapshot(json);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        expect(loaded.state).toEqual(state);
        expect(serializeSnapshot(loaded.state, '1.0.0')).toBe(json);
      }),
      { numRuns: 300 },
    );
  });

  it('a state saved mid-replay and restored continues exactly like the uninterrupted run', () => {
    fc.assert(
      fc.property(seedArb, eventsArb, eventsArb, (seed, first, second) => {
        const e = makeEngine({ modules });
        const start = e.init({ ...newGame, seed });
        const mid = replay(e, start, [startProbe, ...first]).state;
        const restored = deserializeSnapshot(serializeSnapshot(mid, 'v'));
        if (!restored.ok) throw new Error(restored.message);
        const direct = replay(e, mid, second);
        const viaSave = replay(e, restored.state, second);
        expect(viaSave.state).toEqual(direct.state);
        expect(viaSave.effects).toEqual(direct.effects);
      }),
      { numRuns: 200 },
    );
  });
});

describe('clock and pause invariants', () => {
  it('game time never goes backwards and never advances while paused', () => {
    fc.assert(
      fc.property(seedArb, eventsArb, (seed, events) => {
        const e = makeEngine({ modules });
        let state = e.init({ ...newGame, seed });
        for (const event of events) {
          const next = e.reduce(state, event).state;
          expect(next.clock.t + next.clock.frac).toBeGreaterThanOrEqual(
            state.clock.t + state.clock.frac,
          );
          if (state.paused && event.type === 'TICK') expect(next.clock).toEqual(state.clock);
          state = next;
        }
      }),
      { numRuns: 300 },
    );
  });

  const pausedInvariant = (seed: string, events: readonly EngineEvent[], duration: number) => {
    const e = makeEngine({ modules });
    const base = replay(e, e.init({ ...newGame, seed }), events).state;
    const place = intent({
      type: 'PLACE_ORDER',
      patientId: 'px',
      catalogId: 'c',
      durationSec: duration + 60,
    });
    const running = replay(e, { ...base, paused: null }, [place]);
    const accepted = running.state.counters.order > base.counters.order;
    const kinds = running.effects.flatMap((f) => (f.type === 'NOTICE' ? [f.kind] : []));
    // 隨機 tick 可能令更次走到巡房／超時凍結／交更／完結：M6 規則會乾淨拒絕新 order（一個 NOTICE、state 不變）。
    // 能否接受只取決於 state（時鐘階段同巡房），所以兩邊都按 state 斷言，唔靠運氣。
    const phase = base.clock.phase;
    const roundActive = base.shift.rounds.active !== null;
    const expectedKind =
      phase === 'OVERTIME'
        ? 'OVERTIME_FROZEN'
        : phase === 'HANDOVER' || phase === 'ENDED'
          ? 'SHIFT_NOT_ACTIVE'
          : roundActive
            ? 'ROUND_ACTIVE'
            : null;
    expect(accepted).toBe(expectedKind === null);
    if (expectedKind !== null) {
      expect(kinds).toEqual([expectedKind]);
      expect(running.state).toEqual({ ...base, paused: null });
      return;
    }
    const newId = `o${String(running.state.counters.order)}`;
    const paused = replay(e, running.state, [intent({ type: 'PAUSE' })]).state;
    expect(paused.paused).not.toBeNull();

    const blocked = replay(e, paused, [
      intent({ type: 'PLACE_ORDER', patientId: 'py', catalogId: 'c', durationSec: duration }),
    ]);
    expect(blocked.state).toEqual(paused);

    const cancelled = replay(e, paused, [intent({ type: 'CANCEL_ORDER', orderId: newId })]);
    expect(cancelled.state.orders[newId]?.status).toBe('CANCELLED');
    expect(cancelled.state.paused).toEqual(paused.paused);
  };

  it('while paused, PLACE_ORDER never changes state, and CANCEL_ORDER of a running order always succeeds', () => {
    fc.assert(fc.property(seedArb, eventsArb, fc.integer({ min: 0, max: 3600 }), pausedInvariant), {
      numRuns: 200,
    });
  });

  const REGRESSIONS: readonly { name: string; ticks: number[]; phase: string }[] = [
    { name: '越過常規時間進入超時凍結', ticks: [58028, 67910, 123424, 170638], phase: 'OVERTIME' },
    {
      name: '連超時窗口都走完、更次已完結',
      ticks: [116411, 174517, 44598, 144474],
      phase: 'ENDED',
    },
  ];

  it.each(REGRESSIONS)('regression：$name 時落單被乾淨拒絕而唔係靜默失敗', ({ ticks, phase }) => {
    const events: EngineEvent[] = [intent({ type: 'SET_SPEED', speed: 4 }), ...ticks.map(tick)];
    const e = makeEngine({ modules });
    const base = replay(e, e.init({ ...newGame, seed: '' }), events).state;
    expect(base.clock.phase).toBe(phase);
    pausedInvariant('', events, 0);
  });
});

it('fast-check seeds are reproducible in CI logs (sanity)', () => {
  expect(fc.sample(fc.integer(), { numRuns: 1, seed: 7 })).toEqual(
    fc.sample(fc.integer(), { numRuns: 1, seed: 7 }),
  );
});
