import { enqueue } from '../core/eventQueue';
import type { EngineModule } from '../core/module';
import { rngFloat, rngInt } from '../core/rng';
import type { GameState } from '../core/state';

export const PROBE_EVENT_KIND = 'PROBE';

/**
 * 測試用模組：令排程事件、event queue 同分流 RNG 真正參與 state 演變，
 * 令「同 seed ＋ 同 intents → 同結果」嘅 property test 有實際意義。
 */
export const probeModule: EngineModule = {
  name: 'probe',
  handleIntent(state, intent) {
    if (intent.type !== 'EXTENSION' || intent.module !== 'probe') return undefined;
    if (intent.name !== 'start') return undefined;
    return {
      state: {
        ...state,
        scheduler: enqueue(state.scheduler, { time: state.clock.t + 10, kind: PROBE_EVENT_KIND }),
      },
      effects: [],
    };
  },
  handleScheduled(state, event) {
    if (event.kind !== PROBE_EVENT_KIND) return undefined;
    const roll = rngFloat(state.rng, 'events');
    const gap = rngInt(roll.rng, 'events', 30, 300);
    const next: GameState = {
      ...state,
      rng: gap.rng,
      counters: { ...state.counters, order: state.counters.order + 1 },
    };
    const id = `o${String(next.counters.order)}`;
    return {
      state: {
        ...next,
        orders: {
          ...next.orders,
          [id]: {
            id,
            patientId: 'probe',
            catalogId: `roll:${String(roll.value)}`,
            createdAt: event.time,
            startsAt: event.time,
            completesAt: event.time,
            status: 'DONE',
          },
        },
        scheduler: enqueue(next.scheduler, {
          time: event.time + gap.value,
          kind: PROBE_EVENT_KIND,
        }),
      },
      effects: [],
    };
  },
};
