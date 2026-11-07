/**
 * 組裝 engine 快照同 storage 槽位。
 * storage 只可 import engine 型別，所以序列化／migration／驗證喺 app 層串接。
 */
import {
  CURRENT_SCHEMA,
  deserializeSnapshot,
  prepareLoadedState,
  serializeSnapshot,
  summarizeState,
  type DeserializeErrorCode,
  type GameState,
  type SaveTarget,
} from '@/engine';
import type { SaveMeta, SaveRepository, SaveSlotView } from '@/storage';

export type LoadSaveResult =
  | { ok: true; state: GameState; meta: SaveMeta; migratedFrom: number | null }
  | {
      ok: false;
      error: 'MISSING' | 'BLOB_MISSING' | 'CHECKSUM_MISMATCH' | DeserializeErrorCode;
      message: string;
    };

export type ExportSaveResult =
  | { ok: true; filename: string; payload: string }
  | { ok: false; error: 'MISSING' | 'BLOB_MISSING' | 'CHECKSUM_MISMATCH'; message: string };

export interface SaveService {
  save(state: GameState, target: SaveTarget): Promise<SaveMeta>;
  load(slotId: string): Promise<LoadSaveResult>;
  list(): Promise<SaveSlotView[]>;
  remove(slotId: string): Promise<void>;
  exportSlot(slotId: string): Promise<ExportSaveResult>;
  /** 驗證並升級後先寫入；schema 遷移失敗時不覆寫原槽。 */
  importManual(slot: number, json: string): Promise<LoadSaveResult>;
}

export function createSaveService(repo: SaveRepository, appVersion: string): SaveService {
  return {
    save(state, target) {
      return repo.write({
        target,
        payload: serializeSnapshot(state, appVersion),
        summary: summarizeState(state),
        schema: CURRENT_SCHEMA,
        appVersion,
      });
    },

    async load(slotId) {
      const stored = await repo.read(slotId);
      if (!stored.ok) {
        return {
          ok: false,
          error: stored.reason,
          message: `槽位 ${slotId} 無法讀取（${stored.reason}）`,
        };
      }
      const result = deserializeSnapshot(stored.payload);
      if (!result.ok) return { ok: false, error: result.code, message: result.message };
      return {
        ok: true,
        state: prepareLoadedState(result.state),
        meta: stored.meta,
        migratedFrom: result.migratedFrom,
      };
    },

    list() {
      return repo.list();
    },

    remove(slotId) {
      return repo.remove(slotId);
    },

    async exportSlot(slotId) {
      const stored = await repo.read(slotId);
      if (!stored.ok) {
        return {
          ok: false as const,
          error: stored.reason,
          message: `槽位 ${slotId} 無法匯出（${stored.reason}）`,
        };
      }
      return { ok: true as const, filename: `dandu-${slotId}.json`, payload: stored.payload };
    },

    async importManual(slot, json) {
      const result = deserializeSnapshot(json);
      if (!result.ok) return { ok: false as const, error: result.code, message: result.message };
      const state = prepareLoadedState(result.state);
      const meta = await repo.write({
        target: { kind: 'MANUAL', slot },
        payload: serializeSnapshot(state, appVersion),
        summary: summarizeState(state),
        schema: CURRENT_SCHEMA,
        appVersion,
      });
      return { ok: true as const, state, meta, migratedFrom: result.migratedFrom };
    },
  };
}
