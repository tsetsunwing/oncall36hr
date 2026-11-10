/** schema 11 → 12：舊存檔補上外科引流清單。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v11 → v12', () => {
  const engine = realEngine();

  it('舊存檔沒有引流時補上空清單', () => {
    const state = engine.init({ ...params('m12-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: {
        schema: number;
        patients: Record<string, { visible: { drains?: unknown } }>;
      };
    };
    raw.state.schema = 11;
    for (const patient of Object.values(raw.state.patients)) delete patient.visible.drains;
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.11.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(11);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    for (const patient of Object.values(loaded.state.patients)) {
      expect(patient.visible.drains).toEqual([]);
    }
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
  });
});
