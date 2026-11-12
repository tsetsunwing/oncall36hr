/** schema 15 → 16：病人補上煩躁同噁心，未評估＝null。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v15 → v16', () => {
  const engine = realEngine();

  it('舊存檔沒有煩躁同噁心時補上 null', () => {
    const state = engine.init({ ...params('m16-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: { schema: number; patients: Record<string, { visible: Record<string, unknown> }> };
    };
    raw.state.schema = 15;
    for (const patient of Object.values(raw.state.patients)) {
      delete patient.visible.agitation;
      delete patient.visible.nausea;
    }
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.15.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(15);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    for (const patient of Object.values(loaded.state.patients)) {
      expect(patient.visible.agitation).toBeNull();
      expect(patient.visible.nausea).toBeNull();
    }
  });
});
