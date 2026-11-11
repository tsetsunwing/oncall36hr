import { describe, expect, it } from 'vitest';
import { createEngine } from '../core/reducer';
import { gameStateSchema } from '../core/state';
import { effectDeltaAt } from '../case/vitals';
import { departPatient } from '../ward/departure';
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

function placed(times?: number, overMinutes?: number, frequency = 'Q4H') {
  const initial = engine.init({ ...params('scheduled-medication'), mode: 'DAY' });
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
      text: 'Ceftriaxone Q4H',
      params: {
        drugFormularyId: 'ceftriaxone',
        dose: { value: 1, unit: 'g' },
        route: 'IV',
        frequency,
        ...(times ? { times } : {}),
        ...(overMinutes ? { infuseOverMinutes: overMinutes } : {}),
      },
    }),
  ]).state;
}

describe('Q-hourly medication integration', () => {
  it('waits for the 16:00 round, records actual doses and schedules the following round', () => {
    const start = placed();
    const first = Object.values(start.orders)[0];
    if (!first) throw new Error('missing order');
    expect(first.administrations).toMatchObject([
      { scheduledAt: 8 * H, status: 'PLANNED', givenAt: null },
    ]);
    expect(start.patients.p1?.hidden.fsm.flags).not.toContain('abx.iv');
    const patient = start.patients.p1;
    if (!patient) throw new Error('missing patient');
    expect(effectDeltaAt(patient, start.orders, tables, 7 * H)).toEqual({
      hr: 0,
      sbp: 0,
      dbp: 0,
      spo2: 0,
      rr: 0,
      temp: 0,
    });
    const run = advance(engine, start, H);
    const order = run.state.orders[first.id];
    expect(order?.status).toBe('RUNNING');
    expect(order?.administrations).toMatchObject([
      { scheduledAt: 8 * H, status: 'GIVEN', givenAt: 8 * H },
      { scheduledAt: 12 * H, status: 'PLANNED', givenAt: null },
    ]);
    expect(run.state.patients.p1?.hidden.fsm.flags).toContain('abx.iv');
    expect(gameStateSchema.safeParse(JSON.parse(JSON.stringify(run.state))).success).toBe(true);
    const cancelled = feed(engine, run.state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: first.id }),
    ]).state;
    expect(cancelled.orders[first.id]?.administrations?.map((dose) => dose.status)).toEqual([
      'GIVEN',
      'CANCELLED',
    ]);
    expect(cancelled.scheduler.items.some((event) => event.kind === 'MEDICATION_DOSE')).toBe(false);
  });

  it('stops after the prescribed number of doses', () => {
    const start = placed(2);
    const orderId = Object.keys(start.orders)[0];
    if (!orderId) throw new Error('missing order');
    const after = advance(engine, start, 5 * H).state.orders[orderId];
    expect(after?.status).toBe('DONE');
    expect(after?.administrations?.map((dose) => dose.status)).toEqual(['GIVEN', 'GIVEN']);
  });
});

describe('scheduled medication safety', () => {
  it('cancels a planned dose after patient departure without recording it as given', () => {
    const original = placed();
    const id = Object.keys(original.orders)[0];
    if (!id) throw new Error('missing order');
    const wardState = { ...original, ward: { ...original.ward, enabled: true } };
    const departed = departPatient(wardState, 'p1', 'DISCHARGE');
    expect(departed.orders[id]?.status).toBe('CANCELLED');
    expect(departed.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'CANCELLED',
      givenAt: null,
    });
    expect(advance(engine, departed, H).state.orders[id]?.administrations?.[0]?.givenAt).toBeNull();
  });

  it('does not administer a scheduled medication to a patient with a recorded death', () => {
    const original = placed();
    const id = Object.keys(original.orders)[0];
    if (!id) throw new Error('missing order');
    const deceased = {
      ...original,
      death: {
        patientId: 'p1',
        diedAt: 7 * H,
        status: 'PENDING_PROCESS' as const,
        steps: { CERTIFICATE: null, NOTIFY_SENIOR: null, PHONE_FAMILY: null, RECORD: null },
        seniorRank: 'RES',
        delayCharges: 0,
        completedAt: null,
        summary: { cycles: 0, shocks: 0, drugs: 0 },
      },
    };
    const after = advance(engine, deceased, H).state.orders[id];
    expect(after?.status).toBe('CANCELLED');
    expect(after?.administrations?.[0]).toMatchObject({ status: 'CANCELLED', givenAt: null });
  });
});

describe('intermittent infusion integration', () => {
  it('records the start and completion separately and schedules the next Q4H round', () => {
    const state = placed(2, 30);
    const id = Object.keys(state.orders)[0];
    if (!id) throw new Error('missing order');
    const started = advance(engine, state, H).state;
    expect(started.orders[id]?.administrations).toMatchObject([
      { scheduledAt: 8 * H, status: 'INFUSING', startedAt: 8 * H, givenAt: null },
      { scheduledAt: 12 * H, status: 'PLANNED', givenAt: null },
    ]);
    expect(started.patients.p1?.hidden.fsm.flags).not.toContain('abx.iv');
    const completed = advance(engine, started, 30 * 60).state;
    expect(completed.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'GIVEN',
      startedAt: 8 * H,
      givenAt: 8 * H + 30 * 60,
    });
    expect(completed.patients.p1?.hidden.fsm.flags).toContain('abx.iv');
    expect(gameStateSchema.safeParse(JSON.parse(JSON.stringify(completed))).success).toBe(true);
    const last = advance(engine, completed, 4 * H).state.orders[id];
    expect(last?.status).toBe('DONE');
    expect(last?.administrations?.map((dose) => dose.status)).toEqual(['GIVEN', 'GIVEN']);
  });
  it('cancels an active infusion and prevents completion and future doses', () => {
    const state = placed(undefined, 30);
    const id = Object.keys(state.orders)[0];
    if (!id) throw new Error('missing order');
    const started = advance(engine, state, H).state;
    const cancelled = feed(engine, started, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]).state;
    expect(cancelled.orders[id]?.administrations).toMatchObject([
      { status: 'CANCELLED', startedAt: 8 * H, stoppedAt: 8 * H, givenAt: null },
      { status: 'CANCELLED', givenAt: null },
    ]);
    expect(advance(engine, cancelled, H).state.patients.p1?.hidden.fsm.flags).not.toContain(
      'abx.iv',
    );
  });
  it('starts a STAT infusion promptly and completes it once', () => {
    const state = placed(undefined, 30, 'STAT');
    const id = Object.keys(state.orders)[0];
    if (!id) throw new Error('missing order');
    const started = advance(engine, state, 1).state;
    expect(started.orders[id]?.administrations?.[0]).toMatchObject({
      status: 'INFUSING',
      startedAt: 7 * H,
    });
    const finished = advance(engine, started, 30 * 60).state.orders[id];
    expect(finished?.status).toBe('DONE');
    expect(finished?.administrations).toMatchObject([
      { status: 'GIVEN', startedAt: 7 * H, givenAt: 7 * H + 30 * 60 },
    ]);
  });
});
