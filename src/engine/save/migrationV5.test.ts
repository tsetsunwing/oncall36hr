/** schema 4 → 5（M5）：舊存檔載入後補 resus／death／scoreLedger 預設值；搶救中途存檔可以還原。 */
import { describe, expect, it } from 'vitest';
import { give, start, untilArrest } from '../acls/kit';
import { CURRENT_SCHEMA } from '../core/state';
import { advance, params, realEngine } from '../test/realEngine';
import {
  SAVE_FORMAT,
  canonicalStringify,
  deserializeSnapshot,
  serializeSnapshot,
} from './snapshot';

type Obj = Record<string, unknown>;

function downgradeToV4(state: unknown): string {
  const raw = JSON.parse(JSON.stringify(state)) as Obj;
  delete raw.resus;
  delete raw.death;
  delete raw.scoreLedger;
  return canonicalStringify({
    format: SAVE_FORMAT,
    appVersion: '0.4.0',
    state: { ...raw, schema: 4 },
  });
}

describe('save migration v4 → v5', () => {
  const engine = realEngine();

  it('M4 存檔載入後冇搶救、冇死亡流程、ledger 為空，並可繼續玩', () => {
    const state = advance(engine, engine.init(params('m5-1')), 600).state;
    const loaded = deserializeSnapshot(downgradeToV4(state));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(4);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.resus).toBeNull();
    expect(loaded.state.death).toBeNull();
    expect(loaded.state.scoreLedger).toEqual([]);
    const a = advance(engine, loaded.state, 600).state;
    const b = advance(engine, loaded.state, 600).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('搶救中途存檔／讀檔：狀態完全一致，繼續落指示結果一樣', () => {
    const session = give(untilArrest(start('m5-2', 'acs-vf-01')), 'cpr', 10);
    const json = serializeSnapshot(session.state, 'test');
    const loaded = deserializeSnapshot(json);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBeNull();
    expect(canonicalStringify(loaded.state)).toBe(canonicalStringify(session.state));
    const next = (state: typeof session.state) =>
      give({ ...session, state }, 'rhythm check', 15).state;
    expect(canonicalStringify(next(loaded.state))).toBe(canonicalStringify(next(session.state)));
  });
});
