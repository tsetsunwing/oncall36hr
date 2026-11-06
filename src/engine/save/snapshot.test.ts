import { describe, expect, it } from 'vitest';
import { replay } from '../core/reducer';
import { CURRENT_SCHEMA, gameStateSchema, type GameState } from '../core/state';
import { intent, makeEngine, newGame, placeOrder, tick } from '../test/helpers';
import { migrateRawState, type MigrationRegistry } from './migrations';
import {
  SAVE_FORMAT,
  canonicalStringify,
  deserializeSnapshot,
  serializeSnapshot,
  summarizeState,
} from './snapshot';

const engine = makeEngine();
const played = (): GameState =>
  replay(engine, engine.init(newGame), [
    placeOrder(300),
    placeOrder(30),
    tick(1500),
    intent({ type: 'PAUSE' }),
  ]).state;

describe('save snapshot', () => {
  it('round-trips bit-identically (string and structure)', () => {
    const state = played();
    const json = serializeSnapshot(state, '0.1.0');
    const loaded = deserializeSnapshot(json);
    expect(loaded).toMatchObject({ ok: true, appVersion: '0.1.0', migratedFrom: null });
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(state);
    expect(serializeSnapshot(loaded.state, '0.1.0')).toBe(json);
  });

  it('is canonical: key order of the input never changes the bytes', () => {
    expect(canonicalStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
    const state = played();
    const reordered = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    const shuffled = Object.fromEntries(Object.entries(reordered).reverse());
    expect(canonicalStringify(shuffled)).toBe(canonicalStringify(state));
  });

  it('contains only plain JSON (no Date, function, undefined) and carries rng, scheduler and pendingAi', () => {
    const state = played();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    const json = JSON.parse(serializeSnapshot(state, 'x')) as {
      format: string;
      state: Record<string, unknown>;
    };
    expect(json.format).toBe(SAVE_FORMAT);
    expect(Object.keys(json.state)).toEqual(
      expect.arrayContaining(['rng', 'scheduler', 'pendingAi', 'schema']),
    );
  });

  it('summarizes for slot lists', () => {
    expect(summarizeState(played())).toEqual({
      mode: 'NIGHT',
      gameTime: 45,
      difficulty: 'MEDIUM',
      rank: 'MO',
      patientsActive: 0,
    });
  });
});

describe('corrupt or incompatible saves are reported, never thrown', () => {
  const json = serializeSnapshot(played(), '0.1.0');

  it('rejects broken JSON, wrong format and invalid state', () => {
    expect(deserializeSnapshot('{not json')).toMatchObject({ ok: false, code: 'INVALID_JSON' });
    expect(deserializeSnapshot('[]')).toMatchObject({ ok: false, code: 'BAD_FORMAT' });
    expect(deserializeSnapshot('{"format":"other","state":{}}')).toMatchObject({
      ok: false,
      code: 'BAD_FORMAT',
    });
    expect(deserializeSnapshot(json.slice(0, json.length >> 1))).toMatchObject({
      ok: false,
      code: 'INVALID_JSON',
    });

    const tampered = JSON.parse(json) as { state: { clock: { t: unknown } } };
    tampered.state.clock.t = 'soon';
    expect(deserializeSnapshot(JSON.stringify(tampered))).toMatchObject({
      ok: false,
      code: 'INVALID_STATE',
    });

    const extra = JSON.parse(json) as { state: Record<string, unknown> };
    extra.state.hackedField = 1;
    expect(deserializeSnapshot(JSON.stringify(extra))).toMatchObject({
      ok: false,
      code: 'INVALID_STATE',
    });
  });

  it('rejects missing or newer schema versions', () => {
    const noSchema = JSON.parse(json) as { state: Record<string, unknown> };
    delete noSchema.state.schema;
    expect(deserializeSnapshot(JSON.stringify(noSchema))).toMatchObject({
      ok: false,
      code: 'SCHEMA_MISSING',
    });

    const newer = JSON.parse(json) as { state: Record<string, unknown> };
    newer.state.schema = CURRENT_SCHEMA + 1;
    expect(deserializeSnapshot(JSON.stringify(newer))).toMatchObject({
      ok: false,
      code: 'SCHEMA_TOO_NEW',
    });
  });
});

describe('migration hook', () => {
  const v1 = JSON.parse(serializeSnapshot(played(), '0.0.1')) as { state: Record<string, unknown> };
  const accept = (raw: Record<string, unknown>) => ({
    success: true as const,
    data: raw as unknown as GameState,
  });

  it('applies the chain in order and stamps the new schema each step', () => {
    const registry: MigrationRegistry = {
      1: (raw) => ({ ...raw, addedInV2: 'a' }),
      2: (raw) => ({ ...raw, addedInV3: `${String(raw.addedInV2)}b` }),
    };
    const result = migrateRawState(v1.state, 3, registry);
    expect(result).toMatchObject({ ok: true, fromSchema: 1 });
    if (!result.ok) return;
    expect(result.raw).toMatchObject({ schema: 3, addedInV2: 'a', addedInV3: 'ab' });
  });

  it('is wired into deserialize and reports migratedFrom', () => {
    const registry: MigrationRegistry = { 1: (raw) => ({ ...raw, flagged: true }) };
    const result = deserializeSnapshot(JSON.stringify(v1), {
      registry,
      targetSchema: 2,
      validate: accept,
    });
    expect(result).toMatchObject({ ok: true, migratedFrom: 1 });
    if (result.ok) expect(result.state).toMatchObject({ schema: 2, flagged: true });
  });

  it('reports a missing step or a throwing step without losing the caller’s data', () => {
    expect(
      deserializeSnapshot(JSON.stringify(v1), { registry: {}, targetSchema: 2, validate: accept }),
    ).toMatchObject({
      ok: false,
      code: 'NO_MIGRATION',
    });
    const boom: MigrationRegistry = {
      1: () => {
        throw new Error('boom');
      },
    };
    expect(
      deserializeSnapshot(JSON.stringify(v1), {
        registry: boom,
        targetSchema: 2,
        validate: accept,
      }),
    ).toMatchObject({
      ok: false,
      code: 'MIGRATION_FAILED',
    });
  });

  it('current schema needs no migration and the default registry is valid for it', () => {
    expect(migrateRawState({ ...v1.state }, CURRENT_SCHEMA)).toMatchObject({ ok: true });
    expect(gameStateSchema.safeParse(v1.state).success).toBe(true);
  });
});
