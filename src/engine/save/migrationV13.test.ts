/** schema 12 → 13：病人補上疼痛分數同 GCS／瞳孔。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v12 → v13', () => {
  const engine = realEngine();

  it('舊存檔沒有疼痛同 GCS 時，由 ACVPU 推 GCS，瞳孔正常，疼痛留空', () => {
    const state = engine.init({ ...params('m13-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: {
        schema: number;
        patients: Record<
          string,
          { visible: { pain?: unknown; neuro?: unknown; consciousness: string } }
        >;
      };
    };
    raw.state.schema = 12;
    for (const patient of Object.values(raw.state.patients)) {
      delete patient.visible.pain;
      delete patient.visible.neuro;
    }
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.12.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(12);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    for (const patient of Object.values(loaded.state.patients)) {
      expect(patient.visible.pain).toBeNull();
      expect(patient.visible.neuro.pupils.left).toEqual({ sizeMm: 3, reaction: 'BRISK' });
      expect(patient.visible.neuro.pupils.right).toEqual({ sizeMm: 3, reaction: 'BRISK' });
      const { e, v, m } = patient.visible.neuro.gcs;
      expect(e).toBeGreaterThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(m).toBeGreaterThanOrEqual(1);
      // A（alert）的病人應該係滿分；其他由 gcsForConsciousness 決定。
      if (patient.visible.consciousness === 'A') {
        expect([e, v, m]).toEqual([4, 5, 6]);
      }
    }
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
  });
});
