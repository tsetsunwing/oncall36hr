import { describe, expect, it } from 'vitest';
import { nextInfusionBag, startInfusionBag } from './infusionTiming';

const H = 3600;
describe('infusion bag timings', () => {
  it('starts a continuous bag immediately and changes the next one after its own duration', () => {
    const first = startInfusionBag(7 * H, 1000, 8 * H);
    expect(first).toEqual({ startAt: 7 * H, endAt: 15 * H, volumeMl: 1000, rateMlPerHour: 125 });
    const second = nextInfusionBag('CONTINUOUS', first, true);
    expect(second).toMatchObject({ startAt: 15 * H, endAt: 23 * H, volumeMl: 1000 });
  });
  it('does not automatically repeat intermittent or stopped infusions', () => {
    const bag = startInfusionBag(0, 100, 30 * 60);
    expect(bag.rateMlPerHour).toBe(200);
    expect(nextInfusionBag('INTERMITTENT', bag, true)).toBeNull();
    expect(nextInfusionBag('CONTINUOUS', bag, false)).toBeNull();
  });
  it('rejects zero, negative, invalid and non-integer game times', () => {
    expect(() => startInfusionBag(0, 0, H)).toThrow();
    expect(() => startInfusionBag(0, 500, 0)).toThrow();
    expect(() => startInfusionBag(-1, 500, H)).toThrow();
    expect(() => startInfusionBag(0, Infinity, H)).toThrow();
  });
});

import { startRegimenBag, TWO_D_ONE_S_CYCLE } from './infusionTiming';

describe('continuous bag regimens', () => {
  const regimen = {
    solutions: TWO_D_ONE_S_CYCLE,
    volumeMl: 1000,
    durationSeconds: 8 * H,
    maxBags: null,
    stopAt: null,
  };
  it('cycles D5, D5, NS and then repeats from the actual start time', () => {
    const bags = Array.from({ length: 6 }, (_, index) =>
      startRegimenBag(regimen, index, 7 * H + index * 8 * H),
    );
    expect(bags.map((bag) => bag?.solution)).toEqual(['D5', 'D5', 'NS', 'D5', 'D5', 'NS']);
    expect(bags[1]).toMatchObject({ startAt: 15 * H, endAt: 23 * H });
    expect(startRegimenBag(regimen, 1, 16 * H)?.endAt).toBe(24 * H);
  });
  it('honours bag count and interrupts a bag at the prescribed time limit', () => {
    expect(startRegimenBag({ ...regimen, maxBags: 2 }, 2, 16 * H)).toBeNull();
    expect(startRegimenBag({ ...regimen, stopAt: 19 * H }, 1, 15 * H)?.endAt).toBe(19 * H);
    expect(startRegimenBag({ ...regimen, stopAt: 19 * H }, 2, 19 * H)).toBeNull();
  });
  it('rejects missing solution cycles and invalid limits', () => {
    expect(() => startRegimenBag({ ...regimen, solutions: [] }, 0, 0)).toThrow();
    expect(() => startRegimenBag({ ...regimen, maxBags: 0 }, 0, 0)).toThrow();
  });
});

import { HALF_HALF_SOLUTION } from './infusionTiming';

it('records the confirmed 1/2:1/2 solution without inferring an indication', () => {
  const regimen = {
    solutions: [HALF_HALF_SOLUTION],
    volumeMl: 500,
    durationSeconds: 8 * H,
    maxBags: null,
    stopAt: null,
  };
  expect(startRegimenBag(regimen, 0, 0)?.solution).toBe('0.45% Sodium Chloride + 2.5% Dextrose');
});
