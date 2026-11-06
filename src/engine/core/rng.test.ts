import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RNG_STREAMS,
  createRngState,
  rngChance,
  rngFloat,
  rngInt,
  rngStateSchema,
  type RngState,
  type RngStream,
} from './rng';

function drawMany(rng: RngState, stream: RngStream, n: number) {
  const values: number[] = [];
  let state = rng;
  for (let i = 0; i < n; i++) {
    const draw = rngFloat(state, stream);
    values.push(draw.value);
    state = draw.rng;
  }
  return { values, rng: state };
}

describe('split seeded RNG', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = drawMany(createRngState('s1'), 'vitals', 20).values;
    const b = drawMany(createRngState('s1'), 'vitals', 20).values;
    const c = drawMany(createRngState('s2'), 'vitals', 20).values;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('has independent streams: drawing from one never changes another', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(...RNG_STREAMS),
        fc.integer({ min: 0, max: 50 }),
        (seed, stream, n) => {
          const start = createRngState(seed);
          const after = drawMany(start, stream, n).rng;
          for (const other of RNG_STREAMS) {
            if (other !== stream) expect(after[other]).toBe(start[other]);
          }
        },
      ),
    );
  });

  it('gives every stream a different starting state for a seed', () => {
    const state = createRngState('same-seed');
    expect(new Set(Object.values(state)).size).toBe(RNG_STREAMS.length);
  });

  it('keeps state a JSON-safe uint32 that resumes the same sequence after a round trip', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 30 }), (seed, n) => {
        const mid = drawMany(createRngState(seed), 'cpr', n).rng;
        const restored = rngStateSchema.parse(JSON.parse(JSON.stringify(mid)));
        expect(drawMany(restored, 'cpr', 10).values).toEqual(drawMany(mid, 'cpr', 10).values);
      }),
    );
  });

  it('draws floats in [0, 1) and ints inside the requested range', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 1, max: 100 }),
        (seed, min, span) => {
          let rng = createRngState(seed);
          for (let i = 0; i < 25; i++) {
            const f = rngFloat(rng, 'calls');
            expect(f.value).toBeGreaterThanOrEqual(0);
            expect(f.value).toBeLessThan(1);
            const n = rngInt(f.rng, 'calls', min, min + span);
            expect(n.value).toBeGreaterThanOrEqual(min);
            expect(n.value).toBeLessThan(min + span);
            rng = n.rng;
          }
        },
      ),
    );
  });

  it('rngChance respects the p = 0 and p = 1 extremes', () => {
    const rng = createRngState('x');
    expect(rngChance(rng, 'consequence', 0).value).toBe(false);
    expect(rngChance(rng, 'consequence', 1).value).toBe(true);
  });

  it('rejects empty int ranges', () => {
    expect(() => rngInt(createRngState('x'), 'staff', 3, 3)).toThrow(RangeError);
  });
});
