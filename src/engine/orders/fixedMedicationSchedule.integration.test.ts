import { describe, expect, it } from 'vitest';
import { createEngine } from '../core/reducer';
import {
  advance,
  feed,
  intentEvent,
  params,
  realConfig,
  zeroNoiseTables,
} from '../test/realEngine';

const H = 3600;
const base = zeroNoiseTables();
const tables = {
  ...base,
  'order-catalog': base['order-catalog'].map((row) =>
    row.id === 'drug.ceftriaxone'
      ? { ...row, pharmacyGate: false, nurseGate: 'NEVER' as const }
      : row,
  ),
};
const engine = createEngine(realConfig(), { tables });

function placed(frequency: string) {
  const initial = engine.init({ ...params(`fixed-${frequency}`), mode: 'DAY' });
  const at15 = {
    ...initial,
    clock: { ...initial.clock, t: 7 * H },
    scheduler: { ...initial.scheduler, items: [] },
  };
  return feed(engine, at15, [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId: 'p1',
      catalogId: 'drug.ceftriaxone',
      text: `Ceftriaxone ${frequency}`,
      params: {
        drugFormularyId: 'ceftriaxone',
        dose: { value: 1, unit: 'g' },
        route: 'IV',
        frequency,
      },
    }),
  ]).state;
}

function firstOrder(state: ReturnType<typeof placed>) {
  const order = Object.values(state.orders)[0];
  if (!order) throw new Error('missing order');
  return order;
}

describe('fixed-frequency medication rounds', () => {
  it('plans TDS on the 08:00 ward round instead of leaving the order unscheduled', () => {
    const start = placed('TDS');
    expect(firstOrder(start).administrations).toMatchObject([
      { scheduledAt: 8 * H, status: 'PLANNED', givenAt: null },
    ]);
  });

  it('gives the TDS dose on the round and schedules the next one', () => {
    const run = advance(engine, placed('TDS'), H);
    const order = firstOrder(run.state);
    expect(order.administrations).toMatchObject([
      { scheduledAt: 8 * H, status: 'GIVEN', givenAt: 8 * H },
      { scheduledAt: 16 * H, status: 'PLANNED', givenAt: null },
    ]);
  });

  it('plans BD, QID and Daily on their next configured round', () => {
    // 15:00 開單：BD 的 08:00 已過，下一輪是 20:00。
    expect(firstOrder(placed('BD')).administrations).toMatchObject([{ scheduledAt: 12 * H }]);
    expect(firstOrder(placed('QID')).administrations).toMatchObject([{ scheduledAt: 8 * H }]);
    // Daily 只有 08:00 一輪，已過就要等第二日。
    expect(firstOrder(placed('Daily')).administrations).toMatchObject([{ scheduledAt: 24 * H }]);
  });

  it('waits for the next day when the Daily round has already passed', () => {
    const initial = engine.init({ ...params('fixed-daily-late'), mode: 'DAY' });
    const late = {
      ...initial,
      clock: { ...initial.clock, t: 9 * H },
      scheduler: { ...initial.scheduler, items: [] },
    };
    const state = feed(engine, late, [
      intentEvent({
        type: 'PLACE_CATALOG',
        patientId: 'p1',
        catalogId: 'drug.ceftriaxone',
        text: 'Ceftriaxone Daily',
        params: {
          drugFormularyId: 'ceftriaxone',
          dose: { value: 1, unit: 'g' },
          route: 'IV',
          frequency: 'Daily',
        },
      }),
    ]).state;
    expect(firstOrder(state).administrations).toMatchObject([{ scheduledAt: 24 * H }]);
  });
});
