/** schema 2 → 3（M3）：M2 存檔可以載入，order 補預設值、病人補報告同後果欄位。 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, type GameState } from '../core/state';
import { advance, feed, params, realEngine, say } from '../test/realEngine';
import { SAVE_FORMAT, canonicalStringify, deserializeSnapshot } from './snapshot';

const engine = realEngine();

type Obj = Record<string, unknown>;

const without = (value: unknown, keys: string[]): Obj =>
  Object.fromEntries(Object.entries(value as Obj).filter(([key]) => !keys.includes(key)));

function downgradeToV2(state: GameState): string {
  const raw = JSON.parse(JSON.stringify(state)) as Obj;
  const orders = Object.fromEntries(
    Object.entries(raw.orders as Obj).map(([id, order]) => [
      id,
      without(order, ['executorKind', 'cancelledAt', 'resultStatus', 'sampledState', 'gate']),
    ]),
  );
  const patients = Object.fromEntries(
    Object.entries(raw.patients as Obj).map(([id, patient]) => {
      const p = patient as Obj;
      return [
        id,
        {
          ...p,
          hidden: without(p.hidden, ['activeEffects']),
          visible: without(p.visible, ['reports']),
        },
      ];
    }),
  );
  const v2 = { ...without(raw, ['options']), schema: 2, orders, patients };
  return canonicalStringify({ format: SAVE_FORMAT, appVersion: '0.2.0', state: v2 });
}

describe('save migration v2 → v3', () => {
  it('CURRENT_SCHEMA 起碼係 3（M3 引入）', () => {
    expect(CURRENT_SCHEMA).toBeGreaterThanOrEqual(3);
  });

  it('M2 存檔（有進行中同已完成嘅 order）載入後補預設值，order 當作已放行', () => {
    let state = feed(engine, engine.init(params('mig-1')), [say('nrb'), say('ns 500 ml')]).state;
    state = advance(engine, state, 120).state;
    const loaded = deserializeSnapshot(downgradeToV2(state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(2);
    expect(loaded.state.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.state.options).toEqual({ nurseConfirmHighRisk: true });
    const orders = Object.values(loaded.state.orders);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    for (const order of orders) {
      expect(order).toMatchObject({
        executorKind: 'NURSE',
        cancelledAt: null,
        resultStatus: null,
        sampledState: null,
        gate: null,
      });
    }
    expect(loaded.state.patients.p1?.hidden.activeEffects).toEqual([]);
    expect(loaded.state.patients.p1?.visible.reports).toEqual([]);
  });

  it('載入嘅舊存檔可以繼續玩：order 照常完成、重播確定', () => {
    let state = feed(engine, engine.init(params('mig-2')), [say('nrb'), say('ns 500 ml')]).state;
    state = advance(engine, state, 30).state;
    const loaded = deserializeSnapshot(downgradeToV2(state));
    if (!loaded.ok) throw new Error(loaded.message);
    const a = advance(engine, loaded.state, 2400).state;
    const b = advance(engine, loaded.state, 2400).state;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(Object.values(a.orders).every((o) => o.status === 'DONE')).toBe(true);
  });

  it('現行存檔唔會被視為需要遷移', () => {
    const state = engine.init(params('mig-3'));
    const json = canonicalStringify({ format: SAVE_FORMAT, appVersion: 'x', state });
    expect(deserializeSnapshot(json)).toMatchObject({ ok: true, migratedFrom: null });
  });
});
