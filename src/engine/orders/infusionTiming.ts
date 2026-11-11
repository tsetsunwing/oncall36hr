/** Infusion timings are game seconds; no fluid composition is inferred from labels. */
export interface InfusionBag {
  startAt: number;
  endAt: number;
  volumeMl: number;
  rateMlPerHour: number;
}

/** Start one bag now and derive the rate from the prescribed volume and duration. */
export function startInfusionBag(
  startAt: number,
  volumeMl: number,
  durationSeconds: number,
): InfusionBag {
  if (
    !Number.isInteger(startAt) ||
    startAt < 0 ||
    !Number.isFinite(volumeMl) ||
    volumeMl <= 0 ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds <= 0
  )
    throw new RangeError('Invalid infusion start, volume or duration');
  return {
    startAt,
    endAt: startAt + durationSeconds,
    volumeMl,
    rateMlPerHour: (volumeMl * 3600) / durationSeconds,
  };
}

/** Continuous orders replace each completed bag. Intermittent ones do not. */
export function nextInfusionBag(
  mode: 'CONTINUOUS' | 'INTERMITTENT',
  previous: InfusionBag,
  orderActive: boolean,
): InfusionBag | null {
  if (mode !== 'CONTINUOUS' || !orderActive) return null;
  return startInfusionBag(previous.endAt, previous.volumeMl, previous.endAt - previous.startAt);
}

/** A regimen stores the exact prescribed bag labels; no composition is inferred. */
export interface InfusionRegimen {
  solutions: readonly string[];
  volumeMl: number;
  durationSeconds: number;
  maxBags: number | null;
  stopAt: number | null;
}

export interface RegimenBag extends InfusionBag {
  solution: string;
  index: number;
}

/** Starts a bag at the actual start time. A time limit may interrupt the final bag. */
export function startRegimenBag(
  regimen: InfusionRegimen,
  index: number,
  actualStartAt: number,
): RegimenBag | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    regimen.solutions.length === 0 ||
    regimen.solutions.some((solution) => !solution.trim()) ||
    (regimen.maxBags !== null && (!Number.isInteger(regimen.maxBags) || regimen.maxBags < 1)) ||
    (regimen.stopAt !== null && (!Number.isInteger(regimen.stopAt) || regimen.stopAt < 0))
  )
    throw new RangeError('Invalid infusion regimen');
  const bag = startInfusionBag(actualStartAt, regimen.volumeMl, regimen.durationSeconds);
  if (
    (regimen.maxBags !== null && index >= regimen.maxBags) ||
    (regimen.stopAt !== null && actualStartAt >= regimen.stopAt)
  )
    return null;
  const solution = regimen.solutions[index % regimen.solutions.length];
  if (solution === undefined) throw new Error('Invalid infusion solution');
  return {
    ...bag,
    endAt: regimen.stopAt === null ? bag.endAt : Math.min(bag.endAt, regimen.stopAt),
    solution,
    index,
  };
}

/** Order of 2D1S as confirmed by the user: D5, D5, NS; volume is prescribed separately. */
export const TWO_D_ONE_S_CYCLE = ['D5', 'D5', 'NS'] as const;

/** Project-specific name confirmed by the user; not an indication or clinical recommendation. */
export const HALF_HALF_SOLUTION = '0.45% Sodium Chloride + 2.5% Dextrose';
