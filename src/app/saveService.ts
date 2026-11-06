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
import type { SaveMeta, SaveRepository } from '@/storage';

export type LoadSaveResult =
  | { ok: true; state: GameState; meta: SaveMeta; migratedFrom: number | null }
  | {
      ok: false;
      error: 'MISSING' | 'BLOB_MISSING' | 'CHECKSUM_MISMATCH' | DeserializeErrorCode;
      message: string;
    };

export interface SaveService {
  save(state: GameState, target: SaveTarget): Promise<SaveMeta>;
  load(slotId: string): Promise<LoadSaveResult>;
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
  };
}
