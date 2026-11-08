/** schema 9 → 10：舊精力餘量變成三項需要。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v9 → v10', () => {
  const engine = realEngine();

  it('舊存檔冇三項需要時，用餘量的相反數補上', () => {
    const state = engine.init({ ...params('m10-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: {
        schema: number;
        shift: { energy: Record<string, unknown> };
      };
    };
    raw.state.schema = 9;
    raw.state.shift.energy = { percent: 70, lastNudgeAt: null };
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.9.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(9);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.shift.energy.fatigue).toBe(30);
    expect(loaded.state.shift.energy.hunger).toBe(30);
    expect(loaded.state.shift.energy.bladder).toBe(30);
    expect(loaded.state.shift.energy.place).toBeNull();
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
  });
});
