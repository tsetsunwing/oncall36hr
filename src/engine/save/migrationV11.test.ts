/** schema 10 → 11：舊存檔補上上次 NIBP 袖帶。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v10 → v11', () => {
  const engine = realEngine();

  it('舊存檔冇袖帶時，用當時血壓補上', () => {
    const state = engine.init({ ...params('m11-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: {
        schema: number;
        patients: Record<
          string,
          { visible: { vitals: { sbp: number; dbp: number }; cuff?: unknown } }
        >;
      };
    };
    raw.state.schema = 10;
    const first = Object.values(raw.state.patients)[0];
    if (!first) throw new Error('缺病人');
    delete first.visible.cuff;
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.10.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(10);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    const patient = Object.values(loaded.state.patients)[0];
    expect(patient?.visible.cuff).toEqual({
      sbp: first.visible.vitals.sbp,
      dbp: first.visible.vitals.dbp,
    });
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
  });
});
