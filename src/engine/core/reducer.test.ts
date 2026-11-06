import { describe, expect, it } from 'vitest';
import type { Effect, EngineEvent } from './events';
import { createRngState } from './rng';
import { defaultModules, prepareLoadedState, replay, requestAi } from './reducer';
import { enqueue } from './eventQueue';
import { intent, makeEngine, newGame, placeOrder, tick } from '../test/helpers';
import type { EngineModule } from './module';

const engine = makeEngine();
const fresh = () => engine.init(newGame);
const run = (events: EngineEvent[], initial = fresh()) => replay(engine, initial, events);
const notices = (effects: Effect[]) =>
  effects.flatMap((e) => (e.type === 'NOTICE' ? [e.kind] : []));

describe('game clock (C3 B: 1 game minute = 2 real seconds at 1x)', () => {
  it('starts at t=0, 1x, running', () => {
    const s = fresh();
    expect(s.clock).toMatchObject({ t: 0, frac: 0, speed: 1, cprSlow: false, phase: 'REGULAR' });
    expect(s.paused).toBeNull();
  });

  it('advances 60 game seconds per 2000 real ms at 1x', () => {
    expect(run([tick(2000)]).state.clock.t).toBe(60);
    expect(run([tick(1000)]).state.clock.t).toBe(30);
  });

  it('applies the 2x and 4x multipliers', () => {
    expect(run([intent({ type: 'SET_SPEED', speed: 2 }), tick(2000)]).state.clock.t).toBe(120);
    expect(run([intent({ type: 'SET_SPEED', speed: 4 }), tick(2000)]).state.clock.t).toBe(240);
  });

  it('keeps sub-second progress in frac and loses nothing across small ticks', () => {
    const events = Array.from({ length: 200 }, () => tick(7));
    const { state } = run(events);
    expect(state.clock.t + state.clock.frac).toBeCloseTo((200 * 7 * 60) / 2000, 9);
  });

  it('CPR slow-down fixes the effective rate at half of 1x regardless of player speed', () => {
    for (const speed of [1, 2, 4]) {
      const s = { ...fresh(), clock: { ...fresh().clock, speed, cprSlow: true } };
      expect(run([tick(4000)], s).state.clock.t).toBe(60);
    }
  });

  it('ignores zero, negative and non-finite ticks', () => {
    for (const dt of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(run([tick(dt)]).state).toEqual(fresh());
    }
  });
});

describe('pause', () => {
  it('stops the clock and pending orders; resuming continues from the same point', () => {
    const { state: s1 } = run([placeOrder(60), tick(1000), intent({ type: 'PAUSE' })]);
    expect(s1.clock.t).toBe(30);
    const s2 = run([tick(60_000)], s1).state;
    expect(s2.clock).toEqual(s1.clock);
    expect(s2.orders.o1?.status).toBe('RUNNING');
    const s3 = run([intent({ type: 'RESUME' }), tick(1000)], s2).state;
    expect(s3.clock.t).toBe(60);
    expect(s3.orders.o1?.status).toBe('DONE');
  });

  it('blocks new orders while paused (Q76 B) but still allows cancel (S-6 A)', () => {
    const paused = run([placeOrder(600), intent({ type: 'PAUSE' })]).state;
    const blocked = run([placeOrder(10)], paused);
    expect(blocked.state).toEqual(paused);
    expect(notices(blocked.effects)).toEqual(['ORDER_BLOCKED_PAUSED']);

    const cancelled = run([intent({ type: 'CANCEL_ORDER', orderId: 'o1' })], paused);
    expect(cancelled.state.orders.o1?.status).toBe('CANCELLED');
    expect(cancelled.state.paused).not.toBeNull();
    expect(notices(cancelled.effects)).toEqual([]);
    expect(cancelled.state.scheduler.items.some((e) => e.kind === 'ORDER_COMPLETE')).toBe(false);
  });

  it('a cancelled order never completes after resuming', () => {
    const s = run([
      placeOrder(30),
      intent({ type: 'PAUSE' }),
      intent({ type: 'CANCEL_ORDER', orderId: 'o1' }),
      intent({ type: 'RESUME' }),
      tick(10_000),
    ]).state;
    expect(s.orders.o1?.status).toBe('CANCELLED');
  });

  it('SET_SPEED 0 pauses and a non-zero speed un-pauses a player pause', () => {
    const paused = run([intent({ type: 'SET_SPEED', speed: 0 })]).state;
    expect(paused.paused?.by).toBe('player');
    const resumed = run([intent({ type: 'SET_SPEED', speed: 4 })], paused).state;
    expect(resumed.paused).toBeNull();
    expect(resumed.clock.speed).toBe(4);
  });

  it('rejects unsupported speeds and keeps state', () => {
    const r = run([intent({ type: 'SET_SPEED', speed: 3 })]);
    expect(r.state).toEqual(fresh());
    expect(notices(r.effects)).toEqual(['SPEED_INVALID']);
  });

  it('emits an AUTO save when the player pauses, once', () => {
    const r = run([intent({ type: 'PAUSE' }), intent({ type: 'PAUSE' })]);
    expect(r.effects).toEqual([{ type: 'SAVE', target: { kind: 'AUTO' }, reason: 'PAUSE' }]);
  });

  it('cancelling an unknown or finished order is rejected without changing state', () => {
    const done = run([placeOrder(0), tick(1000)]).state;
    expect(done.orders.o1?.status).toBe('DONE');
    for (const orderId of ['o1', 'nope']) {
      const r = run([intent({ type: 'CANCEL_ORDER', orderId })], done);
      expect(r.state).toEqual(done);
      expect(notices(r.effects)).toHaveLength(1);
    }
  });

  it('load defaults to a player pause but keeps an AI-failure pause', () => {
    expect(prepareLoadedState(fresh()).paused).toEqual({ by: 'player', reqId: null });
    const failed = run([{ type: 'AI_FAILURE', reqId: 'r9', reason: 'TIMEOUT' }]).state;
    expect(prepareLoadedState(failed).paused).toEqual({ by: 'ai-failure', reqId: 'r9' });
  });
});

describe('orders (M1 skeleton)', () => {
  it('completes at placement time + fixed duration, in event-queue order', () => {
    const r = run([placeOrder(90, 'a'), placeOrder(30, 'b'), tick(1000)]);
    expect(r.state.orders.o2?.status).toBe('DONE');
    expect(r.state.orders.o1?.status).toBe('RUNNING');
    expect(r.state.orders.o1?.completesAt).toBe(90);
    const later = run([tick(2000)], r.state);
    expect(later.state.orders.o1?.status).toBe('DONE');
  });

  it('rejects malformed orders', () => {
    for (const bad of [placeOrder(-1), placeOrder(1.5), placeOrder(5, '')]) {
      const r = run([bad]);
      expect(r.state).toEqual(fresh());
      expect(notices(r.effects)).toEqual(['ORDER_INVALID']);
    }
  });
});

describe('auto-save scheduling and manual save intents', () => {
  it('emits an AUTO save every 30 game minutes', () => {
    const r = run([tick(60_000)]);
    expect(r.effects.filter((e) => e.type === 'SAVE')).toEqual([
      { type: 'SAVE', target: { kind: 'AUTO' }, reason: 'INTERVAL' },
    ]);
    expect(run([tick(59_000)]).effects).toEqual([]);
    expect(run([tick(180_000)]).effects).toHaveLength(1);
  });

  it('reschedules itself and keeps firing at 30-minute marks', () => {
    const { state } = run([tick(60_000), tick(60_000)]);
    expect(state.scheduler.items.find((e) => e.kind === 'AUTOSAVE')?.time).toBe(5400);
  });

  it('maps SAVE_GAME to a MANUAL save and validates the slot', () => {
    expect(run([intent({ type: 'SAVE_GAME', slot: 3 })]).effects).toEqual([
      { type: 'SAVE', target: { kind: 'MANUAL', slot: 3 }, reason: 'MANUAL' },
    ]);
    for (const slot of [0, 6, 1.5]) {
      expect(notices(run([intent({ type: 'SAVE_GAME', slot })]).effects)).toEqual([
        'SAVE_SLOT_INVALID',
      ]);
    }
  });
});

describe('AI events (§2.3, §12.2)', () => {
  const aiModule: EngineModule = {
    name: 'ai-probe',
    handleIntent(state, i) {
      if (i.type !== 'EXTENSION' || i.module !== 'ai-probe') return undefined;
      const { state: next, effect } = requestAi(state, 'probe.ask', { text: 'x' });
      return { state: next, effects: [effect] };
    },
  };
  const aiEngine = makeEngine({ modules: [...defaultModules, aiModule] });
  const ask: EngineEvent = intent({
    type: 'EXTENSION',
    module: 'ai-probe',
    name: 'ask',
    payload: null,
  });

  it('AI_FAILURE pauses, freezes the clock and saves into the AI_FAILURE slot', () => {
    const asked = replay(aiEngine, aiEngine.init(newGame), [ask]);
    expect(asked.effects).toEqual([
      { type: 'AI_REQUEST', reqId: 'r1', kind: 'probe.ask', context: { text: 'x' } },
    ]);
    const failed = replay(aiEngine, asked.state, [
      { type: 'AI_FAILURE', reqId: 'r1', reason: 'TIMEOUT' },
      tick(60_000),
    ]);
    expect(failed.state.paused).toEqual({ by: 'ai-failure', reqId: 'r1' });
    expect(failed.state.clock.t).toBe(0);
    expect(failed.effects).toEqual([
      { type: 'SAVE', target: { kind: 'AI_FAILURE' }, reason: 'AI_FAILURE' },
    ]);
    expect(failed.state.pendingAi).toHaveLength(1);
  });

  it('a player RESUME cannot bypass an AI-failure pause; retry re-sends the same reqId', () => {
    const failed = replay(aiEngine, aiEngine.init(newGame), [
      ask,
      { type: 'AI_FAILURE', reqId: 'r1', reason: 'NETWORK' },
    ]).state;
    const blocked = replay(aiEngine, failed, [intent({ type: 'RESUME' })]);
    expect(blocked.state.paused?.by).toBe('ai-failure');
    expect(notices(blocked.effects)).toEqual(['RESUME_BLOCKED_AI_FAILURE']);

    const retried = replay(aiEngine, failed, [{ type: 'RESUME_FROM_FAILURE', reqId: 'r1' }]);
    expect(retried.state.paused).toBeNull();
    expect(retried.effects).toEqual([
      { type: 'AI_REQUEST', reqId: 'r1', kind: 'probe.ask', context: { text: 'x' } },
    ]);

    const wrong = replay(aiEngine, failed, [{ type: 'RESUME_FROM_FAILURE', reqId: 'r2' }]);
    expect(wrong.state.paused?.by).toBe('ai-failure');
  });

  it('AI_RESULT clears the pending request', () => {
    const asked = replay(aiEngine, aiEngine.init(newGame), [ask]).state;
    const done = replay(aiEngine, asked, [
      { type: 'AI_RESULT', reqId: 'r1', payload: { ok: true } },
    ]).state;
    expect(done.pendingAi).toEqual([]);
  });
});

describe('purity', () => {
  it('never mutates its input state or event', () => {
    const s = run([placeOrder(100), tick(500)]).state;
    const before = JSON.stringify(s);
    run(
      [tick(50_000), intent({ type: 'PAUSE' }), intent({ type: 'CANCEL_ORDER', orderId: 'o1' })],
      s,
    );
    expect(JSON.stringify(s)).toBe(before);
  });

  it('seeds the RNG deterministically from the game seed', () => {
    expect(fresh().rng).toEqual(createRngState('seed-A'));
    expect(engine.init({ ...newGame, seed: 'seed-B' }).rng).not.toEqual(fresh().rng);
  });

  it('fails loudly instead of looping forever when an event keeps rescheduling itself at the same time', () => {
    const looping: EngineModule = {
      name: 'loop',
      handleScheduled(state, event) {
        if (event.kind !== 'LOOP') return undefined;
        return {
          state: {
            ...state,
            scheduler: enqueue(state.scheduler, { time: event.time, kind: 'LOOP' }),
          },
          effects: [],
        };
      },
    };
    const e = makeEngine({ modules: [looping] });
    const s0 = e.init(newGame);
    const s = { ...s0, scheduler: enqueue(s0.scheduler, { time: 5, kind: 'LOOP' }) };
    expect(() => e.reduce(s, tick(1000))).toThrow(/死循環/);
  });
});
