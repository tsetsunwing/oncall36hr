import { describe, expect, it } from 'vitest';
import {
  cancelPlannedAdministrations,
  planAdministration,
  recordAdministration,
} from './medicationAdministration';

describe('medication administration records', () => {
  it('plans idempotently but does not confuse planning with administration', () => {
    const first = planAdministration([], 'order1', 'patient1', 100);
    expect(planAdministration(first, 'order1', 'patient1', 100)).toEqual(first);
    expect(first[0]).toMatchObject({ status: 'PLANNED', givenAt: null });
    expect(() => planAdministration(first, 'order1', 'patient2', 100)).toThrow();
    expect(() => planAdministration(first, 'order1', 'patient2', 200)).toThrow();
    expect(() => recordAdministration(first, 'order1', 100, 99)).toThrow();
    const given = recordAdministration(first, 'order1', 100, 110);
    expect(given[0]).toMatchObject({ status: 'GIVEN', givenAt: 110 });
    expect(() => recordAdministration(given, 'order1', 100, 111)).toThrow();
  });
  it('cancels only outstanding doses of the cancelled order', () => {
    let records = planAdministration([], 'order1', 'patient1', 100);
    records = recordAdministration(records, 'order1', 100, 100);
    records = planAdministration(records, 'order1', 'patient1', 200);
    records = planAdministration(records, 'order2', 'patient1', 200);
    const cancelled = cancelPlannedAdministrations(records, 'order1');
    expect(cancelled.map((r) => r.status)).toEqual(['GIVEN', 'CANCELLED', 'PLANNED']);
    expect(cancelled[0]?.givenAt).toBe(100);
    expect(() => recordAdministration(cancelled, 'order1', 200, 200)).toThrow();
  });
});
