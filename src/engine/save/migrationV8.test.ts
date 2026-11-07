/** schema 7 → 8（M7）：M4 ward.ledger 同 M5 scoreLedger 合併成單一計分帳；加優先次序追蹤。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, gameStateSchema } from '../core/state';
import { advance, params, realEngine } from '../test/realEngine';
import {
  canonicalStringify,
  deserializeSnapshot,
  SAVE_FORMAT,
  serializeSnapshot,
} from './snapshot';

type Obj = Record<string, unknown>;

function downgradeToV7(state: unknown): string {
  const raw = JSON.parse(JSON.stringify(state)) as Obj;
  delete raw.priority;
  const ward = {
    ...(raw.ward as Obj),
    ledger: [
      {
        id: 'l1',
        t: 50,
        subscore: 'TIMELINESS',
        rule: 'CALL_GO_NOW',
        delta: 1,
        patientId: 'p1',
        callId: 'k1',
      },
      {
        id: 'l2',
        t: 300,
        subscore: 'CLINICAL_OUTCOME',
        rule: 'ROSC',
        delta: 5,
        patientId: 'p1',
        callId: null,
      },
    ],
  };
  const scoreLedger = [
    { id: 's1', t: 120, category: 'COMMUNICATION', code: 'SBAR_GOOD', delta: 2, patientId: 'p1' },
    { id: 's2', t: 50, category: 'SELF_CARE', code: 'SELF_CARE_MEAL', delta: 2, patientId: null },
  ];
  return canonicalStringify({
    format: SAVE_FORMAT,
    appVersion: '0.7.0',
    state: { ...raw, ward, scoreLedger, schema: 7 },
  });
}

describe('save migration v7 → v8', () => {
  const engine = realEngine();

  it('兩本舊計分帳按時間合併、重新編號，欄位改名，並補優先次序追蹤', () => {
    const state = advance(engine, engine.init({ ...params('m7-mig'), ward: true }), 300).state;
    const loaded = deserializeSnapshot(downgradeToV7(state));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBe(7);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(gameStateSchema.safeParse(loaded.state).success).toBe(true);
    const ledger = loaded.state.scoreLedger;
    expect(ledger.map((e) => e.id)).toEqual(['sc1', 'sc2', 'sc3', 'sc4']);
    expect(ledger.map((e) => e.t)).toEqual([50, 50, 120, 300]);
    expect(ledger.map((e) => e.rule)).toEqual([
      'CALL_GO_NOW',
      'SELF_CARE_MEAL',
      'SBAR_GOOD',
      'ROSC',
    ]);
    expect(ledger.map((e) => e.subscore)).toEqual([
      'TIMELINESS',
      'SELF_CARE',
      'COMMUNICATION',
      'CLINICAL_OUTCOME',
    ]);
    expect(ledger.every((e) => e.evidenceRef === null && Object.keys(e.facts).length === 0)).toBe(
      true,
    );
    expect('ledger' in loaded.state.ward).toBe(false);
    expect(loaded.state.priority).toEqual({ lastAttended: {}, urgency: {} });
  });

  it('遷移後可以繼續玩，而且同一存檔重放結果一致', () => {
    const state = advance(engine, engine.init({ ...params('m7-mig-2'), ward: true }), 300).state;
    const loaded = deserializeSnapshot(downgradeToV7(state));
    if (!loaded.ok) throw new Error(loaded.message);
    const a = advance(engine, loaded.state, 600).state;
    const b = advance(engine, loaded.state, 600).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('新存檔來回一致（冇遷移）', () => {
    const state = engine.init({ ...params('m7-roundtrip'), ward: true });
    const loaded = deserializeSnapshot(serializeSnapshot(state, 'test'));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.migratedFrom).toBeNull();
    expect(canonicalStringify(loaded.state)).toBe(canonicalStringify(state));
  });
});
