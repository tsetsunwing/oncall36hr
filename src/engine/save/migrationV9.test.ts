/** schema 8 → 9：巡房改為邀請，舊存檔補 offeredAt。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v8 → v9', () => {
  const engine = realEngine();

  it('舊存檔冇 offeredAt 時補 null，而且可以繼續讀', () => {
    const state = engine.init({ ...params('m9-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: { schema: number; shift: { rounds: { offeredAt?: number | null } } };
    };
    raw.state.schema = 8;
    delete raw.state.shift.rounds.offeredAt;
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.8.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(8);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.shift.rounds.offeredAt).toBeNull();
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
  });
});
