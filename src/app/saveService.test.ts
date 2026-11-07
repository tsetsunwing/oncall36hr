import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEngine, serializeSnapshot, type EngineEvent } from '@/engine';
import { createSaveRepository, openSaveDb } from '@/storage';
import { APP_VERSION } from './appVersion';
import { getEngineConfig } from './engineConfig';
import { createGameRuntime } from './runtime';
import { createSaveService } from './saveService';

const realConfig = getEngineConfig();
const config = { ...realConfig, clock: { ...realConfig.clock, pauseWhileAiPending: false } };
const engine = createEngine(config);
const slots = { manualSlots: 5, autoSlots: 2, aiFailureSlots: 1 };
let counter = 0;

async function services(name = `app-saves-${String(counter++)}`) {
  const db = await openSaveDb(name);
  const repo = createSaveRepository({ db, slots });
  return { db, repo, saves: createSaveService(repo, APP_VERSION) };
}

const newGame = {
  seed: 'app-seed',
  mode: 'ONCALL',
  difficulty: 'HARD',
  playerRank: 'RES',
} as const;
const place = (durationSec: number): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: { type: 'PLACE_ORDER', patientId: 'p1', catalogId: 'lab.cbc', durationSec },
});

describe('real content config', () => {
  it('uses C3 C: 1 game minute = 5 real seconds at 1x, speeds 0/1/2/4, 30-minute autosave, C1 AI auto-pause', () => {
    expect(realConfig.clock.realSecondsPerGameMinuteAt1x).toBe(5);
    expect(realConfig.clock.pauseWhileAiPending).toBe(true);
    expect(realConfig.clock.speeds).toEqual([0, 1, 2, 4]);
    expect(realConfig.saves.autoSaveEveryGameMinutes).toBe(30);
    const real = createEngine(realConfig);
    expect(real.reduce(real.init(newGame), { type: 'TICK', dtRealMs: 5000 }).state.clock.t).toBe(
      60,
    );
  });
});

describe('save service (engine snapshot ↔ IndexedDB)', () => {
  it('saves and loads a state bit-identically; loaded games start paused', async () => {
    const { saves } = await services();
    let state = engine.init(newGame);
    for (const e of [place(600), { type: 'TICK', dtRealMs: 5000 } satisfies EngineEvent]) {
      state = engine.reduce(state, e).state;
    }
    await saves.save(state, { kind: 'MANUAL', slot: 2 });
    const loaded = await saves.load('manual-2');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual({ ...state, paused: { by: 'player', reqId: null } });
    expect(serializeSnapshot({ ...loaded.state, paused: state.paused }, APP_VERSION)).toBe(
      serializeSnapshot(state, APP_VERSION),
    );
    expect(loaded.meta.summary.gameTime).toBe(state.clock.t);
  });

  it('loading a missing, corrupted or tampered slot returns an error and leaves the slot untouched', async () => {
    const { saves, db } = await services();
    expect(await saves.load('manual-1')).toMatchObject({ ok: false, error: 'MISSING' });

    const state = engine.init(newGame);
    await saves.save(state, { kind: 'MANUAL', slot: 1 });
    const [key] = await db.getAllKeys('blobs');
    await db.put('blobs', 'garbage', key);
    expect(await saves.load('manual-1')).toMatchObject({ ok: false, error: 'CHECKSUM_MISMATCH' });
    expect(await db.get('blobs', key!)).toBe('garbage');

    const valid = await services();
    await valid.repo.write({
      target: { kind: 'MANUAL', slot: 1 },
      payload: '{"format":"dandu-save","appVersion":"x","state":{"schema":1}}',
      summary: { mode: 'DAY', gameTime: 0, difficulty: 'EASY', rank: 'HO', patientsActive: 0 },
      schema: 1,
      appVersion: 'x',
    });
    const bad = await valid.saves.load('manual-1');
    expect(bad).toMatchObject({ ok: false, error: 'INVALID_STATE' });
    expect((await valid.repo.read('manual-1')).ok).toBe(true);
  });
});

describe('game runtime (effects → saves)', () => {
  it('writes an AUTO slot every 30 game minutes and a MANUAL slot on SAVE_GAME', async () => {
    const { saves, repo } = await services();
    const runtime = createGameRuntime({ engine, saves, initialState: engine.init(newGame) });
    runtime.dispatch({ type: 'TICK', dtRealMs: 150_000 });
    runtime.dispatch({ type: 'PLAYER_INTENT', intent: { type: 'SAVE_GAME', slot: 4 } });
    await runtime.flushSaves();
    const list = await repo.list();
    expect(
      list
        .filter((s) => s.status === 'OK')
        .map((s) => s.id)
        .sort(),
    ).toEqual(['auto-1', 'manual-4']);
    const auto = await saves.load('auto-1');
    expect(auto.ok && auto.state.clock.t).toBe(1800);
  });

  it('AI failure pauses and writes the dedicated AI_FAILURE slot, then resume works from the loaded save', async () => {
    const { saves } = await services();
    const effects: string[] = [];
    const runtime = createGameRuntime({
      engine,
      saves,
      initialState: engine.init(newGame),
      onEffect: (e) => effects.push(e.type),
    });
    runtime.dispatch({ type: 'TICK', dtRealMs: 10_000 });
    runtime.dispatch({ type: 'AI_FAILURE', reqId: 'r1', reason: 'TIMEOUT' });
    await runtime.flushSaves();
    const loaded = await saves.load('ai-failure-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.paused).toEqual({ by: 'ai-failure', reqId: 'r1' });
    expect(loaded.state.clock.t).toBe(120);
    expect(runtime.getState().paused?.by).toBe('ai-failure');
  });

  it('reports save errors through onSaveError instead of crashing the game loop', async () => {
    const { saves } = await services();
    const failing = { ...saves, save: () => Promise.reject(new Error('quota')) };
    const errors: unknown[] = [];
    const runtime = createGameRuntime({
      engine,
      saves: failing,
      initialState: engine.init(newGame),
      onSaveError: (e) => errors.push(e),
    });
    runtime.dispatch({ type: 'PLAYER_INTENT', intent: { type: 'PAUSE' } });
    await runtime.flushSaves();
    expect(errors).toHaveLength(1);
    expect(runtime.getState().paused?.by).toBe('player');
  });
});

describe('import keeps the previous slot when migration fails', () => {
  it('rejects a newer schema without overwriting the manual slot', async () => {
    const { saves } = await services();
    const state = engine.init(newGame);
    await saves.save(state, { kind: 'MANUAL', slot: 1 });
    const before = await saves.exportSlot('manual-1');
    expect(before.ok).toBe(true);
    const imported = await saves.importManual(
      1,
      JSON.stringify({ format: 'dandu-save', appVersion: 'future', state: { schema: 999 } }),
    );
    expect(imported).toMatchObject({ ok: false, error: 'SCHEMA_TOO_NEW' });
    const after = await saves.exportSlot('manual-1');
    expect(after.ok && before.ok && after.payload).toBe(before.ok ? before.payload : '');
  });
});
