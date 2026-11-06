import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { checksum } from './checksum';
import {
  InvalidSaveTargetError,
  createSaveRepository,
  openSaveDb,
  slotIdsFor,
  type SaveDb,
  type SaveRepository,
  type SaveRepositoryOptions,
  type WriteSaveInput,
} from './saves';

const slots = { manualSlots: 5, autoSlots: 2, aiFailureSlots: 1 };
let dbCounter = 0;

async function setup(options: Partial<Omit<SaveRepositoryOptions, 'db' | 'slots'>> = {}) {
  const name = `test-saves-${String(dbCounter++)}`;
  const db = await openSaveDb(name);
  let clock = 0;
  const repo = createSaveRepository({
    db,
    slots,
    now: () => `2026-11-06T00:00:${String(clock++).padStart(2, '0')}.000Z`,
    ...options,
  });
  return { name, db, repo };
}

const summary = {
  mode: 'NIGHT',
  gameTime: 60,
  difficulty: 'MEDIUM',
  rank: 'MO',
  patientsActive: 0,
} as const;
const input = (
  payload: string,
  target: WriteSaveInput['target'] = { kind: 'MANUAL', slot: 1 },
): WriteSaveInput => ({
  target,
  payload,
  summary,
  schema: 1,
  appVersion: 'test',
});

async function allBlobKeys(db: SaveDb) {
  return db.getAllKeys('blobs');
}

describe('slot layout', () => {
  it('derives 5 manual + 2 auto + 1 AI-failure slots from config', () => {
    expect(slotIdsFor(slots).map((s) => s.id)).toEqual([
      'manual-1',
      'manual-2',
      'manual-3',
      'manual-4',
      'manual-5',
      'auto-1',
      'auto-2',
      'ai-failure-1',
    ]);
  });
});

describe('IndexedDB save slots', () => {
  it('writes and reads back the exact payload with its meta', async () => {
    const { repo } = await setup();
    const payload = JSON.stringify({ hello: '世界', n: [1, 2, 3] });
    const meta = await repo.write(input(payload, { kind: 'MANUAL', slot: 3 }));
    expect(meta).toMatchObject({
      id: 'manual-3',
      kind: 'MANUAL',
      schema: 1,
      appVersion: 'test',
      bytes: payload.length,
    });
    const read = await repo.read('manual-3');
    expect(read).toEqual({ ok: true, meta, payload });
  });

  it('lists every slot with EMPTY / OK status', async () => {
    const { repo } = await setup();
    await repo.write(input('a', { kind: 'MANUAL', slot: 2 }));
    const list = await repo.list();
    expect(list).toHaveLength(8);
    expect(list.filter((s) => s.status === 'OK').map((s) => s.id)).toEqual(['manual-2']);
    expect(list.filter((s) => s.status === 'EMPTY')).toHaveLength(7);
  });

  it('overwrites a manual slot in place without leaving orphan blobs', async () => {
    const { repo, db } = await setup();
    await repo.write(input('one'));
    await repo.write(input('two'));
    const read = await repo.read('manual-1');
    expect(read.ok && read.payload).toBe('two');
    expect(await allBlobKeys(db)).toHaveLength(1);
  });

  it('rotates AUTO saves through the two auto slots, oldest first', async () => {
    const { repo } = await setup();
    const ids: string[] = [];
    for (const p of ['a', 'b', 'c', 'd', 'e'])
      ids.push((await repo.write(input(p, { kind: 'AUTO' }))).id);
    expect(ids).toEqual(['auto-1', 'auto-2', 'auto-1', 'auto-2', 'auto-1']);
    const latest = await repo.read('auto-1');
    expect(latest.ok && latest.payload).toBe('e');
    const other = await repo.read('auto-2');
    expect(other.ok && other.payload).toBe('d');
  });

  it('keeps AI_FAILURE in its own dedicated slot and never touches manual/auto', async () => {
    const { repo } = await setup();
    await repo.write(input('manual'));
    await repo.write(input('auto', { kind: 'AUTO' }));
    const meta = await repo.write(input('failure', { kind: 'AI_FAILURE' }));
    expect(meta).toMatchObject({ id: 'ai-failure-1', kind: 'AI_FAILURE' });
    const m = await repo.read('manual-1');
    expect(m.ok && m.payload).toBe('manual');
  });

  it('rejects out-of-range manual slots', async () => {
    const { repo } = await setup();
    await expect(repo.write(input('x', { kind: 'MANUAL', slot: 6 }))).rejects.toBeInstanceOf(
      InvalidSaveTargetError,
    );
    await expect(repo.write(input('x', { kind: 'MANUAL', slot: 0 }))).rejects.toBeInstanceOf(
      InvalidSaveTargetError,
    );
  });

  it('survives reopening the database (persistence)', async () => {
    const { repo, db, name } = await setup();
    await repo.write(input('persisted'));
    db.close();
    const reopened = createSaveRepository({ db: await openSaveDb(name), slots });
    const read = await reopened.read('manual-1');
    expect(read.ok && read.payload).toBe('persisted');
  });

  it('removes a slot together with its blob', async () => {
    const { repo, db } = await setup();
    await repo.write(input('x'));
    await repo.remove('manual-1');
    expect(await repo.read('manual-1')).toMatchObject({ ok: false, reason: 'MISSING' });
    expect(await allBlobKeys(db)).toHaveLength(0);
  });
});

describe('corrupt-save protection', () => {
  async function seeded(): Promise<{ repo: SaveRepository; db: SaveDb }> {
    const { repo, db } = await setup();
    await repo.write(input('good-save'));
    return { repo, db };
  }

  it('detects a damaged payload by checksum and reports it without deleting anything', async () => {
    const { repo, db } = await seeded();
    const [key] = await allBlobKeys(db);
    await db.put('blobs', 'good-sav3', key);
    expect(await repo.read('manual-1')).toMatchObject({ ok: false, reason: 'CHECKSUM_MISMATCH' });
    const list = await repo.list();
    expect(list.find((s) => s.id === 'manual-1')).toMatchObject({ status: 'CORRUPT' });
    expect(await db.get('blobs', key!)).toBe('good-sav3');
  });

  it('detects a missing blob', async () => {
    const { repo, db } = await seeded();
    const [key] = await allBlobKeys(db);
    await db.delete('blobs', key!);
    expect(await repo.read('manual-1')).toMatchObject({ ok: false, reason: 'BLOB_MISSING' });
  });

  it('a crash between blob write and index update leaves the previous good save intact', async () => {
    const { repo, db } = await seeded();
    const crashing = createSaveRepository({
      db,
      slots,
      hooks: {
        afterBlobWritten: () => {
          throw new Error('power loss');
        },
      },
    });
    await expect(crashing.write(input('half-written'))).rejects.toThrow('power loss');
    const read = await repo.read('manual-1');
    expect(read.ok && read.payload).toBe('good-save');
    expect(await allBlobKeys(db)).toHaveLength(1);
  });

  it('orphan blobs left by a hard kill are cleaned up on the next write', async () => {
    const { repo, db } = await seeded();
    await db.put('blobs', 'orphan', 'manual-1#orphan#99');
    await repo.write(input('next', { kind: 'MANUAL', slot: 2 }));
    expect(await allBlobKeys(db)).toHaveLength(2);
    expect(await db.get('blobs', 'manual-1#orphan#99')).toBeUndefined();
  });

  it('verifies the write by reading back before swapping the index', async () => {
    const { db } = await setup();
    const tampering = createSaveRepository({
      db,
      slots,
      hooks: {
        afterBlobWritten: async () => {
          for (const key of await db.getAllKeys('blobs')) await db.put('blobs', 'garbled', key);
        },
      },
    });
    await expect(tampering.write(input('real'))).rejects.toThrow(/核對失敗/);
    expect(await tampering.read('manual-1')).toMatchObject({ ok: false, reason: 'MISSING' });
  });

  it('checksum differs for any single-character change', () => {
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('abc')).toBe(checksum('abc'));
  });
});
