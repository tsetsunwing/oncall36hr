/** schema 12 → 13：舊存檔未揀病房時當作內科普通病房。 */
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

  it('舊存檔補上內科病房，新遊戲可以揀外科或專科', () => {
    const state = engine.init({ ...params('m13-mig'), ward: true });
    const raw = JSON.parse(serializeSnapshot(state, 'test')) as {
      state: { schema: number; homeWard?: unknown };
    };
    raw.state.schema = 12;
    delete raw.state.homeWard;
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.12.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(12);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.homeWard).toEqual({ kind: 'MEDICINE' });
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);

    expect(engine.init(params('m13-default')).homeWard).toEqual({ kind: 'MEDICINE' });
    expect(engine.init({ ...params('m13-surg'), homeWard: { kind: 'SURGERY' } }).homeWard).toEqual({
      kind: 'SURGERY',
    });
    expect(
      engine.init({
        ...params('m13-card'),
        homeWard: { kind: 'SPECIALTY', deptId: 'CARDIOLOGY' },
      }).homeWard,
    ).toEqual({ kind: 'SPECIALTY', deptId: 'CARDIOLOGY' });
  });
});
