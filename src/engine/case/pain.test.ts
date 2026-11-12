import { describe, expect, it } from 'vitest';
import { createEngine } from '../core/reducer';
import type { Order } from '../orders/orderTypes';
import { feed, intentEvent, params, realConfig, zeroNoiseTables } from '../test/realEngine';
import { ANALGESIA_RELIEF, analgesiaActive, painFor } from './pain';

const tables = zeroNoiseTables();
const engine = createEngine(realConfig(), { tables });

function start(seed = 'pain-assessment') {
  const state = engine.init(params(seed));
  const patient = Object.values(state.patients)[0];
  if (!patient) throw new Error('missing patient');
  return { state, patient };
}

/** 表內該狀態的疼痛分數，唔經 painFor，避免用同一段程式自我印證。 */
function tableScore(patient: ReturnType<typeof start>['patient']): number {
  const template = tables['case-templates'].find((row) => row.id === patient.hidden.caseTemplateId);
  const fsm = tables['case-fsm'].find((row) => row.id === template?.fsmId);
  return fsm?.states[patient.hidden.fsm.state]?.pain ?? 0;
}

describe('pain assessment', () => {
  it('starts unassessed so no number is invented', () => {
    const { patient } = start();
    expect(patient.visible.pain).toBeNull();
  });

  it('reads the assessed score from the case state table', () => {
    const { state, patient } = start();
    const after = feed(engine, state, [
      intentEvent({ type: 'ASSESS_PAIN', patientId: patient.id }),
    ]).state;
    expect(after.patients[patient.id]?.visible.pain).toBe(tableScore(patient));
  });

  it('reads agitation and nausea from the same case state table', () => {
    const { state, patient } = start();
    const assessed = feed(engine, state, [
      intentEvent({ type: 'ASSESS_AGITATION', patientId: patient.id }),
      intentEvent({ type: 'ASSESS_NAUSEA', patientId: patient.id }),
    ]).state;
    const template = tables['case-templates'].find(
      (row) => row.id === patient.hidden.caseTemplateId,
    );
    const fsm = tables['case-fsm'].find((row) => row.id === template?.fsmId);
    const row = fsm?.states[patient.hidden.fsm.state];
    expect(assessed.patients[patient.id]?.visible.agitation).toBe(row?.agitation ?? 0);
    expect(assessed.patients[patient.id]?.visible.nausea).toBe(row?.nausea ?? 0);
  });

  it('starts agitation and nausea unassessed', () => {
    const { patient } = start();
    expect(patient.visible.agitation).toBeNull();
    expect(patient.visible.nausea).toBeNull();
  });

  it('lowers the score when an analgesic has been given', () => {
    const { state, patient } = start();
    const order: Order = {
      id: 'o1',
      patientId: patient.id,
      catalogId: 'drug.paracetamol',
      createdAt: state.clock.t,
      startsAt: state.clock.t,
      completesAt: state.clock.t,
      status: 'DONE',
      source: 'MANUAL',
      params: { drugFormularyId: 'paracetamol', dose: null, route: 'PO' },
      executor: null,
      executorKind: 'NURSE',
      cancelledAt: null,
      resultStatus: null,
      sampledState: null,
      gate: null,
    };
    const withAnalgesia = { ...state, orders: { o1: order } };
    expect(analgesiaActive(withAnalgesia, patient.id, tables, state.clock.t)).toBe(true);
    const base = tableScore(patient);
    expect(painFor(withAnalgesia, patient, tables)).toBe(Math.max(0, base - ANALGESIA_RELIEF));
  });
});
