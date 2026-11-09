import { describe, expect, it } from 'vitest';
import { getContent } from '@/content';
import { effectDeltaAt } from '../case/vitals';
import {
  aiRequests,
  advance,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
} from '../test/realEngine';
import { OXYGEN_DEVICES } from './oxygen';

const tables = realTables();
const engine = realEngine();

function place(
  catalogId: string,
  dose: { value: number; unit: string } | null,
  rate?: { value: number; unit: string },
) {
  return feed(engine, engine.init(params(`oxygen-${catalogId}`)), [
    intentEvent({
      type: 'PLACE_CATALOG',
      patientId: 'p1',
      catalogId,
      text: catalogId,
      params: {
        drugFormularyId: null,
        dose,
        route: null,
        ...(rate ? { rate } : {}),
        summary: catalogId,
      },
    }),
  ]);
}

describe('氧氣治療本地落單', () => {
  it('新裝置沒有生命表徵曲線，但仍設置現有氧氣旗標，並標待臨床覆核', () => {
    const content = getContent().tables;
    for (const device of OXYGEN_DEVICES) {
      const row = content['order-catalog'].find((item) => item.id === device.catalogId);
      expect(row?.reviewStatus, device.catalogId).toBe('PENDING_CLINICAL_REVIEW');
      expect(row?.setsFlags, device.catalogId).toEqual(['oxygen.on']);
      const effects = content['order-effects'].filter(
        (item) => item.catalogId === device.catalogId,
      );
      expect(effects.length > 0, device.catalogId).toBe(device.engineEffect);
    }

    const simple = place('oxygen.simple', { value: 6, unit: 'L/min' });
    const patient = simple.state.patients.p1;
    if (!patient) throw new Error('缺病人');
    const at = simple.state.clock.t + 500;
    expect(effectDeltaAt(patient, simple.state.orders, tables, at)).toEqual(
      effectDeltaAt(patient, {}, tables, at),
    );
    const nasal = place('oxygen.nasal', { value: 4, unit: 'L/min' });
    const nasalPatient = nasal.state.patients.p1;
    if (!nasalPatient) throw new Error('缺病人');
    expect(effectDeltaAt(nasalPatient, nasal.state.orders, tables, at).spo2).toBeGreaterThan(0);
    expect(effectDeltaAt(nasalPatient, nasal.state.orders, tables, at).rr).toBeLessThan(0);

    const done = advance(engine, simple.state, 60);
    expect(done.state.patients.p1?.hidden.fsm.flags).toContain('oxygen.on');
    expect(aiRequests(simple.effects)).toEqual([]);
    expect(aiRequests(done.effects).some((request) => request.kind === 'order.parse')).toBe(false);
  });

  it('超出範圍拒絕，不把流量改成界限內', () => {
    const rejected = place('oxygen.simple', { value: 4, unit: 'L/min' });
    expect(Object.keys(rejected.state.orders)).toHaveLength(0);
    expect(rejected.effects).toContainEqual({
      type: 'NOTICE',
      kind: 'ORDER_INVALID',
      tone: 'warn',
    });
    const accepted = place('oxygen.simple', { value: 10, unit: 'L/min' });
    expect(Object.values(accepted.state.orders)[0]?.params.dose).toEqual({
      value: 10,
      unit: 'L/min',
    });
    expect(place('oxygen.venturi', { value: 25, unit: '%' }).state.orders).toEqual({});
    expect(
      Object.values(place('oxygen.venturi', { value: 24, unit: '%' }).state.orders)[0]?.params.dose,
    ).toEqual({
      value: 24,
      unit: '%',
    });
    expect(
      place('oxygen.hfnc', { value: 9, unit: 'L/min' }, { value: 40, unit: '%' }).state.orders,
    ).toEqual({});
    expect(
      Object.values(
        place('oxygen.hfnc', { value: 10, unit: 'L/min' }, { value: 100, unit: '%' }).state.orders,
      )[0]?.params.rate,
    ).toEqual({ value: 100, unit: '%' });
    expect(
      place('oxygen.niv', { value: 21, unit: '%' }, { value: 4, unit: 'cmH2O' }).state.orders,
    ).toEqual({});
    expect(
      place('oxygen.invasive', { value: 101, unit: '%' }, { value: 5, unit: 'cmH2O' }).state.orders,
    ).toEqual({});
    const peep = place('oxygen.niv', { value: 21, unit: '%' }, { value: 20, unit: 'cmH2O' });
    expect(Object.values(peep.state.orders)[0]?.params.rate).toEqual({ value: 20, unit: 'cmH2O' });
  });
});
