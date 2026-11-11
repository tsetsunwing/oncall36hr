/** Medication administration records are distinct from the original prescription. */
export interface Administration {
  orderId: string;
  patientId: string;
  scheduledAt: number;
  status: 'PLANNED' | 'INFUSING' | 'GIVEN' | 'CANCELLED';
  startedAt?: number | undefined;
  stoppedAt?: number | undefined;
  givenAt: number | null;
}

/** A scheduled occurrence is unique within an order, even after repeated scheduling. */
export function planAdministration(
  records: readonly Administration[],
  orderId: string,
  patientId: string,
  scheduledAt: number,
): Administration[] {
  if (!orderId || !patientId || !Number.isInteger(scheduledAt) || scheduledAt < 0) {
    throw new RangeError('Invalid medication administration');
  }
  if (records.some((r) => r.orderId === orderId && r.patientId !== patientId)) {
    throw new Error('Order patient does not match');
  }
  const existing = records.find((r) => r.orderId === orderId && r.scheduledAt === scheduledAt);
  if (existing) return [...records];
  return [...records, { orderId, patientId, scheduledAt, status: 'PLANNED', givenAt: null }];
}

/** Start an intermittent infusion; completion must be recorded separately. */
export function startAdministration(
  records: readonly Administration[],
  orderId: string,
  scheduledAt: number,
  startedAt: number,
): Administration[] {
  if (!Number.isInteger(startedAt) || startedAt < scheduledAt)
    throw new RangeError('Infusion cannot start before scheduled time');
  const item = records.find(
    (record) => record.orderId === orderId && record.scheduledAt === scheduledAt,
  );
  if (item?.status !== 'PLANNED') throw new Error('No planned administration');
  return records.map((record) =>
    record === item ? { ...record, status: 'INFUSING', startedAt } : record,
  );
}

/** Only the nurse's actual execution may mark an outstanding occurrence as given. */
export function recordAdministration(
  records: readonly Administration[],
  orderId: string,
  scheduledAt: number,
  givenAt: number,
): Administration[] {
  if (!Number.isInteger(givenAt) || givenAt < scheduledAt) {
    throw new RangeError('Administration cannot precede its scheduled time');
  }
  const index = records.findIndex((r) => r.orderId === orderId && r.scheduledAt === scheduledAt);
  const item = records[index];
  if (item?.status !== 'PLANNED' && item?.status !== 'INFUSING')
    throw new Error('No outstanding administration');
  if (item.startedAt !== undefined && givenAt < item.startedAt)
    throw new RangeError('Completion cannot precede start');
  return records.map((record, i) =>
    i === index ? { ...record, status: 'GIVEN', givenAt } : record,
  );
}

/** Cancellation never rewrites the history of doses already administered. */
export function cancelPlannedAdministrations(
  records: readonly Administration[],
  orderId: string,
  stoppedAt?: number,
): Administration[] {
  return records.map((record) =>
    record.orderId === orderId && (record.status === 'PLANNED' || record.status === 'INFUSING')
      ? {
          ...record,
          status: 'CANCELLED',
          ...(record.status === 'INFUSING' && stoppedAt !== undefined ? { stoppedAt } : {}),
        }
      : record,
  );
}
