/** Pure scheduling and PRN eligibility helpers. Times are game seconds from shift start. */

export type FixedFrequency = 'Daily' | 'BD' | 'TDS' | 'QID';
export type IntervalFrequency = 'Q1H' | 'Q2H' | 'Q4H' | 'Q6H' | 'Q8H' | 'Q12H' | 'Q24H';
export type MedicationFrequency = 'STAT' | FixedFrequency | IntervalFrequency;

/** Clock hours are supplied by the caller, not inferred from the frequency. */
export type FixedMedicationHours = Record<FixedFrequency, readonly number[]>;

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const INTERVAL_HOURS: Record<IntervalFrequency, number> = {
  Q1H: 1,
  Q2H: 2,
  Q4H: 4,
  Q6H: 6,
  Q8H: 8,
  Q12H: 12,
  Q24H: 24,
};

/** First eligible time at or after `from`, without a dose before `orderedAt`.
 * Q-hourly scheduled orders align to the specified wall-clock anchor,
 * including across midnight; they do not start counting from the prescription.
 */
export function nextMedicationTime(
  frequency: MedicationFrequency,
  orderedAt: number,
  from: number,
  shiftStartHour: number,
  fixedHours: FixedMedicationHours,
  intervalAnchorHour: number,
): number | null {
  if (!Number.isInteger(orderedAt) || orderedAt < 0 || !Number.isInteger(from) || from < 0) {
    throw new RangeError('Times must be non-negative integer game seconds');
  }
  if (!Number.isInteger(shiftStartHour) || shiftStartHour < 0 || shiftStartHour >= 24) {
    throw new RangeError('Invalid shift start hour');
  }
  if (!Number.isInteger(intervalAnchorHour) || intervalAnchorHour < 0 || intervalAnchorHour >= 24) {
    throw new RangeError('Invalid interval medication anchor hour');
  }
  const earliest = Math.max(orderedAt, from);
  if (frequency === 'STAT') return earliest === orderedAt ? orderedAt : null;
  if (frequency in INTERVAL_HOURS) {
    const period = INTERVAL_HOURS[frequency as IntervalFrequency] * SECONDS_PER_HOUR;
    const anchor = (intervalAnchorHour - shiftStartHour) * SECONDS_PER_HOUR;
    return anchor + Math.ceil((earliest - anchor) / period) * period;
  }
  const hours = fixedHours[frequency as FixedFrequency];
  if (!hours.length || hours.some((hour) => !Number.isInteger(hour) || hour < 0 || hour >= 24)) {
    throw new RangeError(`Invalid fixed medication hours for ${frequency}`);
  }
  const startOffset = shiftStartHour * SECONDS_PER_HOUR;
  const day = Math.floor((earliest + startOffset) / SECONDS_PER_DAY);
  let next = Infinity;
  for (const hour of hours) {
    let candidate = day * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR - startOffset;
    if (candidate < earliest) candidate += SECONDS_PER_DAY;
    next = Math.min(next, candidate);
  }
  return next;
}

export type Comparison = '>' | '>=' | '<' | '<=' | '=';

/** Unknown observations never satisfy a PRN trigger. */
export function prnEligible(
  observed: number | null,
  comparison: Comparison,
  threshold: number,
  now: number,
  lastGivenAt: number | null,
  minimumIntervalSeconds: number,
): boolean {
  if (
    observed === null ||
    !Number.isFinite(observed) ||
    !Number.isFinite(threshold) ||
    !Number.isFinite(now) ||
    !Number.isFinite(minimumIntervalSeconds) ||
    minimumIntervalSeconds < 0 ||
    (lastGivenAt !== null &&
      (!Number.isFinite(lastGivenAt) || now - lastGivenAt < minimumIntervalSeconds))
  )
    return false;
  switch (comparison) {
    case '>':
      return observed > threshold;
    case '>=':
      return observed >= threshold;
    case '<':
      return observed < threshold;
    case '<=':
      return observed <= threshold;
    case '=':
      return observed === threshold;
  }
}
