/** schema 16 → 17：搶救同死亡由「全場一個」改成「每位病人一個」。 */
import { describe, expect, it } from 'vitest';
import { beginDeath } from '../death/death';
import { CURRENT_SCHEMA } from '../core/state';
import { params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

describe('save migration v16 → v17', () => {
  const engine = realEngine();

  function legacy(seed: string) {
    const state = engine.init({ ...params(seed), ward: true });
    const patientId = Object.keys(state.patients)[0] ?? 'p1';
    const died = beginDeath(state, patientId, {
      config: engine.config,
      tables: engine.tables,
    }).state;
    const raw = JSON.parse(serializeSnapshot(died, 'test')) as {
      state: {
        schema: number;
        resus: Record<string, unknown>;
        death: Record<string, unknown>;
      };
    };
    raw.state.schema = 16;
    const death = Object.values(raw.state.death)[0];
    const resus = Object.values(raw.state.resus)[0] ?? null;
    raw.state.death = death as Record<string, unknown>;
    raw.state.resus = resus as Record<string, unknown>;
    return { raw, patientId };
  }

  it('舊存檔嘅單一死亡紀錄搬入該病人 id 之下', () => {
    const { raw, patientId } = legacy('m17-mig');
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.16.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(16);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.death[patientId]?.status).toBe('PENDING_PROCESS');
    expect(Object.keys(loaded.state.death)).toEqual([patientId]);
  });

  it('舊存檔冇搶救紀錄時變成空紀錄', () => {
    const { raw } = legacy('m17-empty');
    raw.state.resus = null as unknown as Record<string, unknown>;
    const loaded = deserializeSnapshot(
      canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.16.0', state: raw.state }),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.state.resus).toEqual({});
  });
});
