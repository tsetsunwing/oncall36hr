/**
 * 存檔槽位（IndexedDB，透過 idb）。設定仍然放 localStorage（見 settings.ts）。
 *
 * 結構：
 * - `slots`：槽位索引（meta ＋ 指向 payload 嘅 blobKey ＋ checksum）。
 * - `blobs`：存檔 payload（canonical JSON 字串）。
 *
 * 兩段式寫入（implementation-plan §12.1）：
 * 1. 以全新 key 寫 blob，再讀返核對 checksum；
 * 2. 同一個 transaction 內更新索引並刪走舊 blob。
 * 任何一步失敗，舊槽位原封不動；孤兒 blob 於下次寫入時清理。
 * 讀取時驗證 checksum；壞檔只回報，絕不刪除或覆寫。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SaveSummary } from '@/engine';
import { checksum } from './checksum';

export const SAVE_DB_NAME = 'dandu-saves';
export const SAVE_DB_VERSION = 1;

export type SaveKind = 'AUTO' | 'MANUAL' | 'AI_FAILURE';

export interface SaveMeta {
  id: string;
  kind: SaveKind;
  savedAt: string;
  summary: SaveSummary;
  schema: number;
  appVersion: string;
  bytes: number;
}

interface SlotRecord extends SaveMeta {
  blobKey: string;
  checksum: string;
  /** 單調遞增寫入序號，自動槽位輪替用（wall-clock 解析度唔夠時仍然穩定） */
  seq: number;
}

interface SaveDbSchema extends DBSchema {
  slots: { key: string; value: SlotRecord };
  blobs: { key: string; value: string };
}

export type SaveDb = IDBPDatabase<SaveDbSchema>;

export function openSaveDb(name: string = SAVE_DB_NAME): Promise<SaveDb> {
  return openDB<SaveDbSchema>(name, SAVE_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('slots', { keyPath: 'id' });
      db.createObjectStore('blobs');
    },
  });
}

export interface SaveSlotsConfig {
  manualSlots: number;
  autoSlots: number;
  aiFailureSlots: number;
}

export type SaveTargetRequest =
  { kind: 'AUTO' } | { kind: 'MANUAL'; slot: number } | { kind: 'AI_FAILURE' };

export interface WriteSaveInput {
  target: SaveTargetRequest;
  payload: string;
  summary: SaveSummary;
  schema: number;
  appVersion: string;
}

export type ReadSaveResult =
  | { ok: true; meta: SaveMeta; payload: string }
  | { ok: false; reason: 'MISSING' | 'BLOB_MISSING' | 'CHECKSUM_MISMATCH'; id: string };

export type SlotStatus = 'EMPTY' | 'OK' | 'CORRUPT';

export interface SaveSlotView {
  id: string;
  kind: SaveKind;
  status: SlotStatus;
  meta: SaveMeta | null;
}

export interface SaveRepositoryOptions {
  db: SaveDb;
  slots: SaveSlotsConfig;
  now?: () => string;
  /** 測試用：喺兩段式寫入之間注入故障（模擬斷電／瀏覽器中途關閉） */
  hooks?: { afterBlobWritten?: () => void | Promise<void> };
}

export class InvalidSaveTargetError extends Error {}

export function slotIdsFor(config: SaveSlotsConfig): { id: string; kind: SaveKind }[] {
  const ids: { id: string; kind: SaveKind }[] = [];
  for (let i = 1; i <= config.manualSlots; i++)
    ids.push({ id: `manual-${String(i)}`, kind: 'MANUAL' });
  for (let i = 1; i <= config.autoSlots; i++) ids.push({ id: `auto-${String(i)}`, kind: 'AUTO' });
  for (let i = 1; i <= config.aiFailureSlots; i++) {
    ids.push({ id: `ai-failure-${String(i)}`, kind: 'AI_FAILURE' });
  }
  return ids;
}

export function createSaveRepository(options: SaveRepositoryOptions) {
  const { db, slots: slotConfig } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const allSlots = slotIdsFor(slotConfig);
  let blobCounter = 0;

  function stripRecord(record: SlotRecord): SaveMeta {
    return {
      id: record.id,
      kind: record.kind,
      savedAt: record.savedAt,
      summary: record.summary,
      schema: record.schema,
      appVersion: record.appVersion,
      bytes: record.bytes,
    };
  }

  async function chooseSlotId(target: SaveTargetRequest): Promise<string> {
    if (target.kind === 'MANUAL') {
      if (
        !Number.isInteger(target.slot) ||
        target.slot < 1 ||
        target.slot > slotConfig.manualSlots
      ) {
        throw new InvalidSaveTargetError(`手動槽位 ${String(target.slot)} 超出範圍`);
      }
      return `manual-${String(target.slot)}`;
    }
    if (target.kind === 'AI_FAILURE') return 'ai-failure-1';
    const autoIds = allSlots.filter((s) => s.kind === 'AUTO').map((s) => s.id);
    const records = await Promise.all(autoIds.map((id) => db.get('slots', id)));
    const empty = autoIds.find((_, i) => !records[i]);
    if (empty) return empty;
    let oldest: SlotRecord | undefined;
    for (const record of records) {
      if (record && (!oldest || record.seq < oldest.seq)) oldest = record;
    }
    return oldest?.id ?? autoIds[0] ?? 'auto-1';
  }

  async function purgeOrphanBlobs(): Promise<void> {
    const [keys, records] = await Promise.all([db.getAllKeys('blobs'), db.getAll('slots')]);
    const live = new Set(records.map((r) => r.blobKey));
    const orphans = keys.filter((k) => !live.has(k));
    if (orphans.length === 0) return;
    const tx = db.transaction('blobs', 'readwrite');
    await Promise.all([...orphans.map((k) => tx.store.delete(k)), tx.done]);
  }

  async function write(input: WriteSaveInput): Promise<SaveMeta> {
    const id = await chooseSlotId(input.target);
    const kind: SaveKind = input.target.kind;
    const blobKey = `${id}#${now()}#${String(blobCounter++)}`;
    const sum = checksum(input.payload);

    await db.put('blobs', input.payload, blobKey);
    try {
      await options.hooks?.afterBlobWritten?.();
      const readBack = await db.get('blobs', blobKey);
      if (readBack === undefined || checksum(readBack) !== sum) {
        throw new Error('存檔寫入後核對失敗');
      }
      const seq = (await db.getAll('slots')).reduce((max, r) => Math.max(max, r.seq), 0) + 1;
      const record: SlotRecord = {
        seq,
        id,
        kind,
        savedAt: now(),
        summary: input.summary,
        schema: input.schema,
        appVersion: input.appVersion,
        bytes: input.payload.length,
        blobKey,
        checksum: sum,
      };
      const tx = db.transaction(['slots', 'blobs'], 'readwrite');
      const previous = await tx.objectStore('slots').get(id);
      await Promise.all([
        tx.objectStore('slots').put(record),
        previous ? tx.objectStore('blobs').delete(previous.blobKey) : Promise.resolve(),
        tx.done,
      ]);
      return stripRecord(record);
    } catch (error) {
      await db.delete('blobs', blobKey).catch(() => undefined);
      throw error;
    } finally {
      await purgeOrphanBlobs().catch(() => undefined);
    }
  }

  async function read(id: string): Promise<ReadSaveResult> {
    const record = await db.get('slots', id);
    if (!record) return { ok: false, reason: 'MISSING', id };
    const payload = await db.get('blobs', record.blobKey);
    if (payload === undefined) return { ok: false, reason: 'BLOB_MISSING', id };
    if (checksum(payload) !== record.checksum)
      return { ok: false, reason: 'CHECKSUM_MISMATCH', id };
    return { ok: true, meta: stripRecord(record), payload };
  }

  async function list(): Promise<SaveSlotView[]> {
    return Promise.all(
      allSlots.map(async ({ id, kind }): Promise<SaveSlotView> => {
        const result = await read(id);
        if (result.ok) return { id, kind, status: 'OK', meta: result.meta };
        if (result.reason === 'MISSING') return { id, kind, status: 'EMPTY', meta: null };
        const record = await db.get('slots', id);
        return { id, kind, status: 'CORRUPT', meta: record ? stripRecord(record) : null };
      }),
    );
  }

  async function remove(id: string): Promise<void> {
    const tx = db.transaction(['slots', 'blobs'], 'readwrite');
    const record = await tx.objectStore('slots').get(id);
    await Promise.all([
      tx.objectStore('slots').delete(id),
      record ? tx.objectStore('blobs').delete(record.blobKey) : Promise.resolve(),
      tx.done,
    ]);
  }

  return { write, read, list, remove, purgeOrphanBlobs };
}

export type SaveRepository = ReturnType<typeof createSaveRepository>;
