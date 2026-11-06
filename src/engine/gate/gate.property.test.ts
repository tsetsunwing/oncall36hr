/**
 * M3 性質測試：隨機落單／回覆把關／堅持／取消／暫停／前進時間。
 * 不變量：同 seed ＋ 同動作序列 → 完全相同嘅 state；state 一直符合 schema 並可存檔重載；
 * 新入職護士唔會發 gate.nurse；GATED 以外嘅 order 冇停留喺審視階段；後果只會由 consequence stream 影響。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../core/eventQueue';
import type { EngineEvent } from '../core/events';
import { gameStateSchema, type GameState } from '../core/state';
import { canonicalStringify, deserializeSnapshot, serializeSnapshot } from '../save/snapshot';
import {
  advance,
  aiRequests,
  feed,
  intentEvent,
  params,
  realEngine,
  say,
  zeroNoiseTables,
} from '../test/realEngine';

const engine = realEngine(zeroNoiseTables());

type Step =
  | { kind: 'say'; text: string }
  | {
      kind: 'answer';
      pick: number;
      verdict: 'OK' | 'CONFIRM' | 'OBJECT';
      danger: 'LOW' | 'MID' | 'HIGH';
    }
  | { kind: 'insist'; pick: number }
  | { kind: 'cancel'; pick: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'wait'; seconds: number };

const PHRASES = [
  'augmentin 1.2 g iv',
  'ceftriaxone 1 g iv',
  'paracetamol 500 mg po',
  'furosemide 40 mg iv',
  'cbc',
  'ecg',
  'cxr',
  'ns 500 ml',
  'nrb',
  'foley sub',
  'ng tube myself',
  'intubation',
  'check vitals',
];

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(...PHRASES).map((text): Step => ({ kind: 'say', text })),
  },
  {
    weight: 6,
    arbitrary: fc
      .record({
        pick: fc.nat(5),
        verdict: fc.constantFrom('OK', 'CONFIRM', 'OBJECT'),
        danger: fc.constantFrom('LOW', 'MID', 'HIGH'),
      })
      .map((r): Step => ({ kind: 'answer', ...r })),
  },
  { weight: 3, arbitrary: fc.nat(5).map((pick): Step => ({ kind: 'insist', pick })) },
  { weight: 1, arbitrary: fc.nat(5).map((pick): Step => ({ kind: 'cancel', pick })) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: 'pause' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: 'resume' }) },
  {
    weight: 3,
    arbitrary: fc
      .integer({ min: 1, max: 3600 })
      .map((seconds): Step => ({ kind: 'wait', seconds })),
  },
);

interface Sim {
  state: GameState;
  requests: { reqId: string; kind: string }[];
  nurseGateRequests: number;
}

function ordersList(state: GameState) {
  return Object.values(state.orders).sort((a, b) =>
    a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
}

function apply(sim: Sim, step: Step): Sim {
  let events: EngineEvent[] = [];
  let next = sim;
  switch (step.kind) {
    case 'say':
      events = [say(step.text)];
      break;
    case 'answer': {
      const pending = next.state.pendingAi.filter((p) => p.kind.startsWith('gate.'));
      const target = pending[step.pick % Math.max(1, pending.length)];
      if (!target) return sim;
      const payload: JsonValue =
        target.kind === 'gate.danger'
          ? { danger: step.danger, category: 'ALLERGY', rationale: 'r' }
          : step.verdict === 'OK'
            ? { verdict: 'OK', concerns: [] }
            : {
                verdict: step.verdict,
                concerns: [
                  { category: 'ALLERGY', line: '{{order.label}} 同 {{patient.allergies}} 有關。' },
                ],
              };
      events = [{ type: 'AI_RESULT', reqId: target.reqId, payload }];
      break;
    }
    case 'insist':
    case 'cancel': {
      const orders = ordersList(next.state);
      const target = orders[step.pick % Math.max(1, orders.length)];
      if (!target) return sim;
      events = [
        intentEvent({
          type: step.kind === 'insist' ? 'INSIST_ORDER' : 'CANCEL_ORDER',
          orderId: target.id,
        }),
      ];
      break;
    }
    case 'pause':
      events = [intentEvent({ type: 'PAUSE' })];
      break;
    case 'resume':
      events = [intentEvent({ type: 'RESUME' })];
      break;
    case 'wait': {
      const run = advance(engine, next.state, step.seconds);
      return collect(next, run.state, run.effects);
    }
  }
  const run = feed(engine, next.state, events);
  next = collect(next, run.state, run.effects);
  return next;
}

function collect(sim: Sim, state: GameState, effects: Parameters<typeof aiRequests>[0]): Sim {
  const requests = aiRequests(effects);
  return {
    state,
    requests: [...sim.requests, ...requests.map((r) => ({ reqId: r.reqId, kind: r.kind }))],
    nurseGateRequests:
      sim.nurseGateRequests + requests.filter((r) => r.kind === 'gate.nurse').length,
  };
}

function run(seed: string, steps: Step[], over: Partial<ReturnType<typeof params>> = {}): Sim {
  let sim: Sim = {
    state: engine.init({ ...params(seed), ...over }),
    requests: [],
    nurseGateRequests: 0,
  };
  for (const step of steps) sim = apply(sim, step);
  return sim;
}

const stepsArb = fc.array(stepArb, { maxLength: 40 });

describe('把關性質（M3）', () => {
  it('同 seed ＋ 同動作 → 逐位元相同嘅 state；state 一直有效並可存檔重載', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), stepsArb, (seed, steps) => {
        const a = run(seed, steps);
        const b = run(seed, steps);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
        expect(a.requests).toEqual(b.requests);
        expect(gameStateSchema.safeParse(a.state).success).toBe(true);
        const loaded = deserializeSnapshot(serializeSnapshot(a.state, 'test'));
        expect(loaded.ok).toBe(true);
        if (loaded.ok) expect(canonicalStringify(loaded.state)).toBe(canonicalStringify(a.state));
      }),
      { numRuns: 40 },
    );
  });

  it('HARD（新入職護士）：任何動作序列都唔會發 gate.nurse', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), stepsArb, (seed, steps) => {
        const sim = run(seed, steps, { difficulty: 'HARD' });
        expect(sim.nurseGateRequests).toBe(0);
        for (const order of Object.values(sim.state.orders)) {
          expect(order.gate?.reviews.some((r) => r.by === 'NURSE') ?? false).toBe(false);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('藥物 order 一定經藥房：有 pharmacyGate 嘅 order 一定有 PHARMACY review；放行前唔會 RUNNING／DONE', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), stepsArb, (seed, steps) => {
        const sim = run(seed, steps);
        for (const order of Object.values(sim.state.orders)) {
          const row = engine.tables['order-catalog'].find((r) => r.id === order.catalogId);
          if (!row?.pharmacyGate) continue;
          expect(
            order.gate?.reviews.some((r) => r.by === 'PHARMACY'),
            order.id,
          ).toBe(true);
          if (order.status === 'RUNNING' || order.status === 'DONE') {
            expect(order.gate?.phase, order.id).toBe('RELEASED');
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('GATED 以外嘅 order 冇停喺審視／決定階段；後果只存在於已堅持過嘅 order', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), stepsArb, (seed, steps) => {
        const sim = run(seed, steps);
        for (const order of Object.values(sim.state.orders)) {
          if (order.status === 'GATED') continue;
          if (order.status === 'RUNNING' || order.status === 'DONE') {
            expect(order.gate === null || order.gate.phase === 'RELEASED', order.id).toBe(true);
          }
        }
        const effectOrders =
          sim.state.patients.p1?.hidden.activeEffects.map((e) => e.orderId) ?? [];
        for (const orderId of effectOrders) {
          expect(sim.state.orders[orderId]?.gate?.insistCount, orderId).toBeGreaterThan(0);
        }
      }),
      { numRuns: 40 },
    );
  });
});
