import { describe, expect, it } from 'vitest';
import { nextMedicationTime, prnEligible, type FixedMedicationHours } from './medicationSchedule';

// Example times for exercising the algorithm, not approved hospital timings.
const hours: FixedMedicationHours = {
  Daily: [8],
  BD: [8, 20],
  TDS: [8, 14, 20],
  QID: [6, 12, 18, 23],
};
const H = 3600;

describe('medication scheduling', () => {
  it('uses the next fixed round after an order, including across midnight', () => {
    expect(nextMedicationTime('BD', 7 * H, 7 * H, 8, hours, 8)).toBe(12 * H);
    expect(nextMedicationTime('BD', 13 * H, 13 * H, 8, hours, 8)).toBe(24 * H);
    expect(nextMedicationTime('TDS', 6 * H, 6 * H, 8, hours, 8)).toBe(6 * H);
  });
  it('aligns Q-hourly doses to 08:00 instead of order time', () => {
    expect(nextMedicationTime('Q4H', 7 * H, 0, 8, hours, 8)).toBe(8 * H);
    expect(nextMedicationTime('Q4H', 8 * H, 8 * H + 1, 8, hours, 8)).toBe(12 * H);
    expect(nextMedicationTime('Q6H', 7 * H, 7 * H, 8, hours, 8)).toBe(12 * H);
    expect(nextMedicationTime('Q8H', 7 * H, 7 * H, 8, hours, 8)).toBe(8 * H);
    expect(nextMedicationTime('Q12H', 13 * H, 13 * H, 8, hours, 8)).toBe(24 * H);
    expect(nextMedicationTime('Q24H', 7 * H, 7 * H, 8, hours, 8)).toBe(24 * H);
    // Night shift begins at 18:00; next Q4H slot is 20:00.
    expect(nextMedicationTime('Q4H', 0, 0, 18, hours, 8)).toBe(2 * H);
  });
  it('schedules STAT once', () => {
    expect(nextMedicationTime('STAT', 10, 10, 8, hours, 8)).toBe(10);
    expect(nextMedicationTime('STAT', 10, 11, 8, hours, 8)).toBeNull();
  });
  it('rejects invalid times and missing fixed rounds', () => {
    expect(() => nextMedicationTime('BD', 0, 0, 24, hours, 8)).toThrow();
    expect(() => nextMedicationTime('BD', 0, 0, 8, { ...hours, BD: [] }, 8)).toThrow();
  });
});

describe('PRN eligibility', () => {
  it('requires a known observation, threshold and minimum interval', () => {
    expect(prnEligible(null, '>', 4, 4 * H, null, 4 * H)).toBe(false);
    expect(prnEligible(4, '>', 4, 4 * H, null, 4 * H)).toBe(false);
    expect(prnEligible(5, '>', 4, 4 * H - 1, 0, 4 * H)).toBe(false);
    expect(prnEligible(5, '>', 4, 4 * H, 0, 4 * H)).toBe(true);
    expect(prnEligible(38, '>=', 38, 0, null, 4 * H)).toBe(true);
    expect(prnEligible(40, '>=', 38, 0, 1, 4 * H)).toBe(false);
  });
});
