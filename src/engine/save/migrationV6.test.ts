/** schema 5 → 6（M4b）：電話記錄補 purpose／exchange，進行中嘅 SBAR 草稿作廢。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA } from '../core/state';
import { advance, feed, intentEvent, realEngine } from '../test/realEngine';
import {
  SAVE_FORMAT,
  canonicalStringify,
  deserializeSnapshot,
  serializeSnapshot,
} from './snapshot';

type Obj = Record<string, unknown>;

function downgradeToV5(state: unknown): string {
  const raw = JSON.parse(JSON.stringify(state)) as { ward: { calls: Obj[]; draft: Obj | null } };
  raw.ward.calls = raw.ward.calls.map((c) => {
    const rest = { ...c };
    delete rest.purpose;
    delete rest.exchange;
    return rest;
  });
  if (raw.ward.draft) {
    delete raw.ward.draft.purpose;
    delete raw.ward.draft.vitalsRef;
  }
  return canonicalStringify({
    format: SAVE_FORMAT,
    appVersion: '0.5.0',
    state: { ...raw, schema: 5 },
  });
}

describe('save migration v5 → v6', () => {
  const engine = realEngine();
  const base = () =>
    engine.init({
      seed: 'm4b-mig',
      mode: 'NIGHT',
      difficulty: 'MEDIUM',
      playerRank: 'MO',
      ward: true,
    });

  it('舊電話補 purpose／exchange；草稿作廢；可以繼續玩，結果確定', () => {
    let state = advance(engine, base(), 3600).state;
    const patientId = Object.keys(state.patients)[0] ?? 'p1';
    state = feed(engine, state, [
      intentEvent({
        type: 'EXTENSION',
        module: 'ward',
        name: 'PREPARE_CALL',
        payload: { patientId, target: { kind: 'RANK', rank: 'RES' } },
      }),
    ]).state;
    expect(state.ward.draft).not.toBeNull();
    const loaded = deserializeSnapshot(downgradeToV5(state));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(5);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.ward.draft).toBeNull();
    for (const call of loaded.state.ward.calls) {
      expect(call.purpose).toBe('GENERAL');
      expect(call.exchange).toBeNull();
    }
    const a = advance(engine, loaded.state, 600).state;
    const b = advance(engine, loaded.state, 600).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('新存檔（含 exchange）往返一致', () => {
    const state = advance(engine, base(), 600).state;
    const loaded = deserializeSnapshot(serializeSnapshot(state, 'test'));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBeNull();
    expect(canonicalStringify(loaded.state)).toBe(canonicalStringify(state));
  });
});
