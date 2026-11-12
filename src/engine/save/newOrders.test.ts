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
import { deserializeSnapshot, serializeSnapshot } from './snapshot';

const H = 3600;
const base = zeroNoiseTables();
const tables = {
  ...base,
  'order-catalog': base['order-catalog'].map((row) =>
    row.type === 'DRUG' || row.id === 'fluid.maintenance'
      ? { ...row, pharmacyGate: false, nurseGate: 'NEVER' as const }
      : row,
  ),
};
const engine = createEngine(realConfig(), { tables });

function started() {
  const initial = engine.init(params('save-new-orders'));
  const patientId = Object.values(initial.patients)[0]?.id;
  if (!patientId) throw new Error('missing patient');
  const placed = feed(engine, initial, [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId,
      catalogId: 'drug.ceftriaxone',
      text: 'Ceftriaxone TDS',
      params: {
        drugFormularyId: 'ceftriaxone',
        dose: { value: 1, unit: 'g' },
        route: 'IV',
        frequency: 'TDS',
      },
    }),
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId,
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
  return advance(engine, placed, H).state;
}

describe('saving orders created by the new mechanisms', () => {
  it('keeps scheduled doses, PRN history and fluid bags through save and restore', () => {
    const played = started();
    const order = Object.values(played.orders).find((item) => item.administrations);
    expect(order?.administrations?.length).toBeGreaterThan(0);
    const loaded = deserializeSnapshot(serializeSnapshot(played, 'test'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(played);
    const fluid = Object.values(loaded.state.orders).find((item) => item.fluidBags);
    expect(fluid?.fluidBags?.length).toBeGreaterThan(0);
  });

  it('carries on the same way after restoring', () => {
    const played = started();
    const loaded = deserializeSnapshot(serializeSnapshot(played, 'test'));
    if (!loaded.ok) throw new Error('restore failed');
    const continued = advance(engine, played, 3 * H).state;
    const restored = advance(engine, loaded.state, 3 * H).state;
    expect(restored).toEqual(continued);
  });

  it('keeps the assessed pain score after restore', () => {
    const patientId = Object.values(started().patients)[0]?.id;
    if (!patientId) throw new Error('missing patient');
    const assessed = feed(engine, started(), [
      intentEvent({ type: 'ASSESS_PAIN', patientId }),
    ]).state;
    const loaded = deserializeSnapshot(serializeSnapshot(assessed, 'test'));
    if (!loaded.ok) throw new Error('restore failed');
    expect(loaded.state.patients[patientId]?.visible.pain).toBe(
      assessed.patients[patientId]?.visible.pain,
    );
  });
});
