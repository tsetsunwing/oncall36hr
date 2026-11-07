/** schema 6 → 7（M6）：舊存檔載入後補 shift 預設值同 rounds RNG 分流；新存檔來回一致。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { createRngState } from '../core/rng';
import { emptyShift } from '../shift/shiftState';
import { advance, params, realEngine } from '../test/realEngine';
import {
  SAVE_FORMAT,
  canonicalStringify,
  deserializeSnapshot,
  serializeSnapshot,
} from './snapshot';

type Obj = Record<string, unknown>;

function downgradeToV6(state: unknown): string {
  const raw = JSON.parse(JSON.stringify(state)) as Obj;
  delete raw.shift;
  const rng = { ...(raw.rng as Obj) };
  delete rng.rounds;
  return canonicalStringify({
    format: SAVE_FORMAT,
    appVersion: '0.6.0',
    state: { ...raw, rng, schema: 6 },
  });
}

describe('save migration v5 → v6', () => {
  const engine = realEngine();

  it('M4b（schema 6）存檔載入後有預設 shift 狀態同確定性嘅 rounds RNG，並可繼續玩', () => {
    const state = advance(engine, engine.init(params('m6-mig')), 600).state;
    const loaded = deserializeSnapshot(downgradeToV6(state));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(6);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.shift).toEqual(emptyShift());
    expect(loaded.state.rng.rounds).toBe(createRngState('m6-mig').rounds);
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
    const a = advance(engine, loaded.state, 600).state;
    const b = advance(engine, loaded.state, 600).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('巡房途中存檔／讀檔：狀態完全一致', () => {
    const state = engine.init(params('m6-roundtrip'));
    const json = serializeSnapshot(state, 'test');
    const loaded = deserializeSnapshot(json);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBeNull();
    expect(canonicalStringify(loaded.state)).toBe(canonicalStringify(state));
  });
});
