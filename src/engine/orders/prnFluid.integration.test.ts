import { describe, expect, it } from 'vitest';
import { createEngine } from '../core/reducer';
import { gameStateSchema, type GameState } from '../core/state';
import {
  advance,
  feed,
  intentEvent,
  params,
  realConfig,
  zeroNoiseTables,
} from '../test/realEngine';

const H = 3600;
const original = zeroNoiseTables();
const tables = {
  ...original,
  'order-catalog': original['order-catalog'].map((row) =>
    row.id === 'drug.ceftriaxone'
      ? { ...row, pharmacyGate: false, nurseGate: 'NEVER' as const }
      : row,
  ),
};
const engine = createEngine(realConfig(), { tables });
function initial(): GameState {
  const state = engine.init({ ...params('prn-fluid'), mode: 'DAY' });
  return {
    ...state,
    clock: { ...state.clock, t: 7 * H },
    scheduler: { ...state.scheduler, items: [] },
  };
}
function prn(condition = true) {
  return feed(engine, initial(), [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId: 'p1',
      catalogId: 'drug.ceftriaxone',
      text: 'PRN fever',
      params: {
        drugFormularyId: 'ceftriaxone',
        dose: { value: 1, unit: 'g' },
        route: 'IV',
        frequency: 'Q4H',
        prnReason: 'Fever',
        ...(condition
          ? {
              prnCondition: {
                metric: 'TEMPERATURE' as const,
                comparison: '>=' as const,
                threshold: 38,
              },
            }
          : {}),
      },
    }),
  ]).state;
}
function withTemperature(state: GameState, temp: number) {
  const patient = state.patients.p1;
  if (!patient) throw new Error('missing patient');
  return {
    ...state,
    patients: {
      ...state.patients,
      p1: {
        ...patient,
        visible: { ...patient.visible, vitals: { ...patient.visible.vitals, temp } },
      },
    },
  };
}
function fluid(options: { maxBags?: number; maxDurationSeconds?: number } = {}) {
  return feed(engine, initial(), [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId: 'p1',
      catalogId: 'fluid.maintenance',
      text: '2D1S',
      params: {
        drugFormularyId: null,
        dose: null,
        route: 'IV Infusion',
        fluidRegimen: {
          solutions: ['D5', 'D5', 'NS'],
          volumeMl: 500,
          durationSeconds: 6 * H,
          additive: '20K',
          ...options,
        },
      },
    }),
  ]).state;
}
function onlyId(state: GameState) {
  const id = Object.keys(state.orders)[0];
  if (!id) throw new Error('missing order');
  return id;
}
describe('PRN execution', () => {
  it('holds below-threshold fever, then measures the interval from actual administration', () => {
    const state = withTemperature(prn(), 37);
    const id = onlyId(state);
    const unknown = advance(engine, state, 120).state;
    expect(unknown.orders[id]?.administrations).toEqual([]);
    expect(unknown.orders[id]?.prnAssessments?.at(-1)).toMatchObject({
      outcome: 'NOT_MET',
      observed: 37,
    });
    expect(unknown.patients.p1?.hidden.fsm.flags).not.toContain('abx.iv');
    const assessed = advance(engine, withTemperature(unknown, 38), 60).state;
    const firstAt = assessed.orders[id]?.administrations?.[0]?.givenAt;
    expect(firstAt).toBe(7 * H + 180);
    expect(assessed.orders[id]?.prnAssessments?.at(-1)).toMatchObject({
      outcome: 'ELIGIBLE',
      observed: 38,
    });
    expect(assessed.patients.p1?.hidden.fsm.flags).toContain('abx.iv');
    const tooSoon = advance(engine, assessed, 4 * H - 60).state;
    expect(tooSoon.orders[id]?.administrations?.filter((x) => x.status === 'GIVEN')).toHaveLength(
      1,
    );
    const second = advance(engine, tooSoon, 60).state;
    expect(second.orders[id]?.administrations?.filter((x) => x.status === 'GIVEN')).toHaveLength(2);
    expect(second.orders[id]?.administrations?.[1]?.givenAt).toBe(firstAt! + 4 * H);
    expect(gameStateSchema.safeParse(JSON.parse(JSON.stringify(second))).success).toBe(true);
  });
  it('does not give when temperature is below threshold or when an old PRN order has no condition', () => {
    const low = withTemperature(prn(), 37);
    const id = onlyId(low);
    expect(advance(engine, low, 600).state.orders[id]?.administrations).toEqual([]);
    const legacy = withTemperature(prn(false), 40);
    const id2 = onlyId(legacy);
    const after = advance(engine, legacy, H).state;
    expect(after.orders[id2]?.status).toBe('RUNNING');
    expect(after.orders[id2]?.administrations).toEqual([]);
  });
  it('holds unsupported pain PRN even when a visible pain score exists', () => {
    const start = initial();
    const patient = start.patients.p1;
    if (!patient) throw new Error('missing patient');
    const state = {
      ...start,
      patients: { ...start.patients, p1: { ...patient, visible: { ...patient.visible, pain: 9 } } },
    };
    const placed = feed(engine, state, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.ceftriaxone',
        text: 'PRN pain',
        params: {
          drugFormularyId: 'ceftriaxone',
          dose: { value: 1, unit: 'g' },
          route: 'IV',
          frequency: 'Q4H',
          prnReason: 'Pain',
          prnCondition: { metric: 'PAIN', comparison: '>', threshold: 4 },
        },
      }),
    ]).state;
    const id = onlyId(placed);
    const after = advance(engine, placed, H).state;
    expect(after.orders[id]?.administrations).toEqual([]);
    expect(after.orders[id]?.prnAssessments?.at(-1)).toMatchObject({ outcome: 'INVALID' });
  });
  it('evaluates temperature against the prescribed threshold', () => {
    const base = initial();
    const patient = base.patients.p1;
    if (!patient) throw new Error('missing patient');
    const febrile = {
      ...base,
      patients: {
        ...base.patients,
        p1: {
          ...patient,
          visible: { ...patient.visible, vitals: { ...patient.visible.vitals, temp: 38 } },
        },
      },
    };
    const state = feed(engine, febrile, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.ceftriaxone',
        text: 'PRN fever',
        params: {
          drugFormularyId: 'ceftriaxone',
          dose: { value: 1, unit: 'g' },
          route: 'IV',
          frequency: 'Q4H',
          prnReason: 'Fever',
          prnCondition: { metric: 'TEMPERATURE', comparison: '>=', threshold: 38 },
        },
      }),
    ]).state;
    const id = onlyId(state);
    const after = advance(engine, state, 1).state;
    expect(after.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'GIVEN',
      givenAt: 7 * H,
    });
    expect(after.orders[id]?.prnAssessments?.[0]).toMatchObject({
      observed: 38,
      outcome: 'ELIGIBLE',
    });
  });
  it('PRN intermittent infusion completes before the next interval is measured', () => {
    const original = prn();
    const id = onlyId(original);
    const order = original.orders[id];
    if (!order) throw new Error('missing order');
    const timed = {
      ...original,
      orders: {
        ...original.orders,
        [id]: { ...order, params: { ...order.params, infuseOverMinutes: 30 } },
      },
    };
    const started = advance(engine, withTemperature(timed, 38), 1).state;
    expect(started.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'INFUSING',
      startedAt: 7 * H,
    });
    const done = advance(engine, started, 30 * 60).state;
    expect(done.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'GIVEN',
      givenAt: 7 * H + 1800,
    });
    const before = advance(engine, done, 4 * H - 60).state;
    expect(before.orders[id]?.administrations).toHaveLength(1);
    const next = advance(engine, before, 60).state;
    expect(next.orders[id]?.administrations?.[1]).toMatchObject({
      status: 'INFUSING',
      startedAt: 7 * H + 1800 + 4 * H,
    });
  });
  it('cancelling prevents further evaluations or administrations', () => {
    const state = advance(engine, withTemperature(prn(), 38), 1).state;
    const id = onlyId(state);
    const cancelled = feed(engine, state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]).state;
    expect(cancelled.scheduler.items.some((e) => e.kind === 'PRN_CHECK')).toBe(false);
    expect(advance(engine, cancelled, 5 * H).state.orders[id]?.administrations).toHaveLength(1);
  });
});
describe('continuous fluids', () => {
  it('rejects a maintenance order without a prescribed regimen', () => {
    const state = initial();
    const manual = feed(engine, state, [
      intentEvent({
        type: 'PLACE_ORDER',
        patientId: 'p1',
        catalogId: 'fluid.maintenance',
        durationSec: 0,
      }),
    ]);
    expect(Object.keys(manual.state.orders)).toHaveLength(0);
    expect(manual.effects).toContainEqual({ type: 'NOTICE', kind: 'ORDER_INVALID', tone: 'warn' });
    const direct = feed(engine, state, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'fluid.maintenance',
        text: 'fluid',
        params: { drugFormularyId: null, dose: null, route: null },
      }),
    ]);
    expect(Object.keys(direct.state.orders)).toHaveLength(0);
  });
  it('starts immediately and cycles D5 D5 NS from actual bag start until cancelled', () => {
    const state = fluid();
    const id = onlyId(state);
    expect(state.orders[id]?.fluidBags).toMatchObject([
      { solution: 'D5', additive: '20K', startAt: 7 * H, status: 'INFUSING' },
    ]);
    const after = advance(engine, state, 18 * H).state;
    expect(after.orders[id]?.fluidBags?.map((b) => [b.solution, b.startAt, b.status])).toEqual([
      ['D5', 7 * H, 'COMPLETE'],
      ['D5', 13 * H, 'COMPLETE'],
      ['NS', 19 * H, 'COMPLETE'],
      ['D5', 25 * H, 'INFUSING'],
    ]);
    expect(gameStateSchema.safeParse(JSON.parse(JSON.stringify(after))).success).toBe(true);
    const cancelled = feed(engine, after, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]).state;
    expect(cancelled.orders[id]?.fluidBags?.[3]).toMatchObject({
      status: 'STOPPED',
      endedAt: 25 * H,
    });
    expect(advance(engine, cancelled, 12 * H).state.orders[id]?.fluidBags).toHaveLength(4);
  });
  it('honours bag count and a duration limit that cuts a bag short', () => {
    const count = fluid({ maxBags: 2 });
    const id = onlyId(count);
    const counted = advance(engine, count, 13 * H).state.orders[id];
    expect(counted?.status).toBe('DONE');
    expect(counted?.fluidBags).toHaveLength(2);
    const limited = fluid({ maxDurationSeconds: 8 * H });
    const id2 = onlyId(limited);
    const stopped = advance(engine, limited, 9 * H).state.orders[id2];
    expect(stopped?.status).toBe('DONE');
    expect(stopped?.fluidBags?.[1]).toMatchObject({ status: 'STOPPED', endedAt: 15 * H });
  });
});
