import { describe, expect, it } from 'vitest';
import { give, onlyResus, start, untilArrest } from '../acls/kit';
import { moveTo } from './movement';

function atArrest() {
  const session = untilArrest(start('leave-cpr', 'acs-vf-01'));
  const patient = session.state.patients.p1;
  if (!patient || !onlyResus(session.state)) throw new Error('Missing arrest patient');
  return {
    ...session,
    state: {
      ...session.state,
      ward: {
        ...session.state.ward,
        enabled: true,
        location: { bed: patient.bed, movingTo: null, arriveAt: null },
      },
    },
  };
}

describe('CPR when leaving the bedside', () => {
  it('resumes an already started, paused CPR without giving drugs or shocks', () => {
    const started = give(atArrest(), 'cpr', 10);
    const resus = onlyResus(started.state);
    if (!resus) throw new Error('Missing resus');
    if (resus.cpr.firstAt === null) throw new Error('CPR did not start');
    const paused = {
      ...started.state,
      resus: {
        ...started.state.resus,
        [resus.patientId]: { ...resus, cpr: { ...resus.cpr, state: 'PAUSED' as const } },
      },
    };
    const result = moveTo(paused, null, {
      config: started.engine.config,
      tables: started.engine.tables,
    });
    expect(onlyResus(result.state)?.cpr.state).toBe('ACTIVE');
    expect(onlyResus(result.state)?.shocks).toBe(resus.shocks);
    expect(onlyResus(result.state)?.drugs).toEqual(resus.drugs);
    expect(result.state.scheduler.items.some((e) => e.kind === 'ACLS_CYCLE_DUE')).toBe(true);
  });

  it('does not start CPR that was not started', () => {
    const session = atArrest();
    const result = moveTo(session.state, null, {
      config: session.engine.config,
      tables: session.engine.tables,
    });
    expect(onlyResus(result.state)?.cpr.state).toBe('NOT_STARTED');
    expect(onlyResus(result.state)?.shocks).toBe(0);
    expect(onlyResus(result.state)?.drugs).toEqual([]);
  });

  it('keeps active CPR running without extra interventions', () => {
    const session = give(atArrest(), 'cpr', 10);
    const before = onlyResus(session.state);
    const result = moveTo(session.state, null, {
      config: session.engine.config,
      tables: session.engine.tables,
    });
    expect(onlyResus(result.state)?.cpr.state).toBe('ACTIVE');
    expect(onlyResus(result.state)?.shocks).toBe(before?.shocks);
    expect(onlyResus(result.state)?.drugs).toEqual(before?.drugs);
  });
});
