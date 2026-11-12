import { describe, expect, it } from 'vitest';
import { effectDeltaAt } from '../case/vitals';
import { createEngine } from '../core/reducer';
import { feed, intentEvent, params, realConfig, zeroNoiseTables } from '../test/realEngine';
import { fluidVolumeFactor, infusedVolumeMl } from './infusionVolume';
import type { Order } from './orderTypes';

const H = 3600;
const tables = zeroNoiseTables();
const engine = createEngine(realConfig(), { tables });

function patient() {
  const state = engine.init(params('infusion-volume'));
  const first = Object.values(state.patients)[0];
  if (!first) throw new Error('missing patient');
  return first;
}

function fluidOrder(bags: NonNullable<Order['fluidBags']>): Order {
  return {
    id: 'o1',
    patientId: patient().id,
    catalogId: 'fluid.maintenance',
    createdAt: 0,
    startsAt: 0,
    completesAt: 24 * H,
    status: 'RUNNING',
    source: 'MANUAL',
    params: {
      drugFormularyId: null,
      dose: null,
      route: 'IV Infusion',
      fluidRegimen: {
        solutions: ['0.9% NaCl'],
        volumeMl: 500,
        durationSeconds: 4 * H,
      },
    },
    executor: null,
    executorKind: 'NURSE',
    cancelledAt: null,
    resultStatus: null,
    sampledState: null,
    gate: null,
    fluidBags: bags,
  };
}

const runningBag = {
  index: 0,
  solution: '0.9% NaCl',
  volumeMl: 500,
  startAt: 0,
  scheduledEndAt: 4 * H,
  endedAt: null,
  status: 'INFUSING' as const,
};

describe('infused volume', () => {
  it('counts only the volume that has actually gone in', () => {
    const order = fluidOrder([runningBag]);
    expect(infusedVolumeMl(order, 0)).toBe(0);
    expect(infusedVolumeMl(order, 2 * H)).toBe(250);
    expect(infusedVolumeMl(order, 4 * H)).toBe(500);
    expect(infusedVolumeMl(order, 6 * H)).toBe(500);
    expect(fluidVolumeFactor(order, 2 * H)).toBe(0.5);
  });

  it('keeps only the part that went in when the bag is stopped early', () => {
    const stopped = fluidOrder([{ ...runningBag, status: 'STOPPED', endedAt: 1 * H }]);
    expect(infusedVolumeMl(stopped, 3 * H)).toBe(125);
    expect(fluidVolumeFactor(stopped, 3 * H)).toBe(0.25);
  });
});

describe('fluid physiological effect', () => {
  it('raises systolic pressure in proportion to the volume infused', () => {
    const order = fluidOrder([runningBag]);
    const at2h = effectDeltaAt(patient(), { o1: order }, tables, 2 * H);
    const at4h = effectDeltaAt(patient(), { o1: order }, tables, 4 * H);
    expect(at2h.sbp).toBeGreaterThan(0);
    expect(at4h.sbp).toBeGreaterThan(at2h.sbp);
    expect(at2h.hr).toBeLessThan(0);
  });

  it('gives a smaller effect when the bag is stopped early', () => {
    const running = fluidOrder([runningBag]);
    const stopped = fluidOrder([{ ...runningBag, status: 'STOPPED', endedAt: 1 * H }]);
    const full = effectDeltaAt(patient(), { o1: running }, tables, 3 * H).sbp;
    const partial = effectDeltaAt(patient(), { o1: stopped }, tables, 3 * H).sbp;
    expect(partial).toBeLessThan(full);
    expect(partial).toBeGreaterThan(0);
  });

  it('has no effect before the fluid starts', () => {
    const order = fluidOrder([{ ...runningBag, startAt: 2 * H, scheduledEndAt: 6 * H }]);
    expect(effectDeltaAt(patient(), { o1: order }, tables, 1 * H).sbp).toBe(0);
  });

  it('still accepts a freshly placed maintenance order', () => {
    const state = engine.init(params('infusion-place'));
    const placed = feed(engine, state, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: Object.values(state.patients)[0]?.id ?? 'p1',
        catalogId: 'fluid.maintenance',
        text: 'IV fluid',
        params: {
          drugFormularyId: null,
          dose: null,
          route: 'IV Infusion',
          fluidRegimen: { solutions: ['0.9% NaCl'], volumeMl: 500, durationSeconds: 4 * H },
        },
      }),
    ]).state;
    expect(Object.values(placed.orders)).toHaveLength(1);
  });
});
